from __future__ import annotations

import base64
import io
import json
import os
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import open_clip
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image

BRAND_CONFIG_PATH = Path(__file__).resolve().parents[2] / "brand.config.json"
try:
    BRAND_CONFIG = json.loads(BRAND_CONFIG_PATH.read_text(encoding="utf-8"))
except (OSError, ValueError):
    BRAND_CONFIG = {}

APP_NAME = os.getenv("APP_NAME") or BRAND_CONFIG.get("name") or "TCG Store"
VISION_NAME = os.getenv("APP_VISION_NAME") or BRAND_CONFIG.get("visionName") or f"{APP_NAME} Vision"

app = FastAPI(title=f"{VISION_NAME} Beta", version="1.0")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_NAME = os.getenv("SHINY_VISUAL_MODEL", "ViT-B-32")
PRETRAINED = os.getenv("SHINY_VISUAL_PRETRAINED", "laion2b_s34b_b79k")

model, _, preprocess = open_clip.create_model_and_transforms(
    MODEL_NAME,
    pretrained=PRETRAINED,
    device=DEVICE,
)
model.eval()

_cache: dict[str, tuple[float, torch.Tensor]] = {}


class CatalogItem(BaseModel):
    row_id: int | None = None
    id: str | int | None = None
    sku: str | None = None
    nombre: str | None = None
    categoria: str | None = None
    imagen: str | None = None
    local_path: str


class SearchRequest(BaseModel):
    image_base64: str
    catalog: list[CatalogItem]
    limit: int = 5



class ExternalCandidate(BaseModel):
    source: str | None = None
    game: str | None = None
    external_id: str | None = None
    name: str | None = None
    set_name: str | None = None
    set_code: str | None = None
    collector_number: str | None = None
    rarity: str | None = None
    type: str | None = None
    description: str | None = None
    image: str | None = None
    language: str | None = None
    market_price_usd: float | None = None
    raw_hint: dict[str, Any] | None = None


class ExternalRankRequest(BaseModel):
    image_base64: str
    candidates: list[ExternalCandidate]
    limit: int = 10

def decode_image(data_url: str) -> np.ndarray:
    raw = str(data_url or "")
    if "," in raw and raw.lower().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        binary = base64.b64decode(raw, validate=False)
    except Exception as exc:
        raise HTTPException(400, f"INVALID_IMAGE_BASE64:{exc}")
    arr = np.frombuffer(binary, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "INVALID_IMAGE")
    return img


def order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).reshape(-1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    rect[1] = pts[np.argmin(d)]
    rect[3] = pts[np.argmax(d)]
    return rect


def four_point_transform(image: np.ndarray, pts: np.ndarray) -> np.ndarray:
    rect = order_points(pts.astype(np.float32))
    tl, tr, br, bl = rect
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    max_w = max(64, int(max(width_a, width_b)))
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_h = max(64, int(max(height_a, height_b)))
    dst = np.array(
        [[0, 0], [max_w - 1, 0], [max_w - 1, max_h - 1], [0, max_h - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image, matrix, (max_w, max_h))


def crop_card(image: np.ndarray) -> tuple[np.ndarray, bool]:
    h, w = image.shape[:2]
    if h < 80 or w < 80:
        return image, False

    scale = min(1.0, 1200.0 / max(h, w))
    small = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 60, 160)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:20]
    img_area = small.shape[0] * small.shape[1]

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < img_area * 0.12:
            continue
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(approx) != 4:
            continue

        pts = approx.reshape(4, 2).astype(np.float32)
        warped = four_point_transform(small, pts)
        wh = warped.shape[1] / max(1, warped.shape[0])
        ratio = min(wh, 1 / max(wh, 1e-6))
        # TCG cards are roughly 0.70 width/height. Use a tolerant range.
        if 0.52 <= ratio <= 0.86:
            return warped, True

    return small, False


def cv_to_pil(image: np.ndarray) -> Image.Image:
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)


@torch.inference_mode()
def embedding_for_pil(image: Image.Image) -> torch.Tensor:
    tensor = preprocess(image.convert("RGB")).unsqueeze(0).to(DEVICE)
    emb = model.encode_image(tensor)
    emb = emb / emb.norm(dim=-1, keepdim=True)
    return emb.cpu()


@torch.inference_mode()
def embedding_for_path(path: str) -> torch.Tensor | None:
    p = Path(path)
    if not p.is_file():
        return None

    try:
        mtime = p.stat().st_mtime
    except OSError:
        return None

    cached = _cache.get(str(p))
    if cached and cached[0] == mtime:
        return cached[1]

    try:
        with Image.open(p) as im:
            emb = embedding_for_pil(im)
    except Exception:
        return None

    _cache[str(p)] = (mtime, emb)
    return emb



_remote_cache: dict[str, torch.Tensor] = {}


def normalized_remote_url(url: str) -> str:
    value = str(url or "").strip()
    if not value:
        return ""
    if "assets.tcgdex.net" in value and not value.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        return value.rstrip("/") + "/high.webp"
    return value


@torch.inference_mode()
def remote_image_embedding(url: str) -> torch.Tensor | None:
    url = normalized_remote_url(url)
    if not url.startswith(("https://", "http://")):
        return None

    if url in _remote_cache:
        return _remote_cache[url]

    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "TCG-Store-External-Card-Beta/1.0",
                "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8",
            },
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            data = response.read(8 * 1024 * 1024 + 1)

        if not data or len(data) > 8 * 1024 * 1024:
            return None

        with Image.open(io.BytesIO(data)) as im:
            emb = embedding_for_pil(im.convert("RGB"))

        if len(_remote_cache) > 600:
            _remote_cache.clear()

        _remote_cache[url] = emb
        return emb
    except Exception:
        return None

@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": f"{VISION_NAME} Beta",
        "opencv": cv2.__version__,
        "openclip_model": MODEL_NAME,
        "pretrained": PRETRAINED,
        "device": DEVICE,
        "cache_items": len(_cache),
    }


@app.post("/search")
def search(req: SearchRequest) -> dict[str, Any]:
    if not req.catalog:
        return {"ok": True, "matches": [], "catalog_count": 0, "card_detected": False}

    source = decode_image(req.image_base64)
    cropped, detected = crop_card(source)
    query_emb = embedding_for_pil(cv_to_pil(cropped))

    scored = []
    for item in req.catalog:
        emb = embedding_for_path(item.local_path)
        if emb is None:
            continue
        score = float((query_emb @ emb.T).item())
        scored.append({
            "row_id": item.row_id,
            "id": item.id,
            "sku": item.sku,
            "nombre": item.nombre,
            "categoria": item.categoria,
            "imagen": item.imagen,
            "similarity": max(0.0, min(1.0, score)),
        })

    scored.sort(key=lambda x: x["similarity"], reverse=True)
    limit = max(1, min(int(req.limit or 5), 10))

    return {
        "ok": True,
        "matches": scored[:limit],
        "catalog_count": len(req.catalog),
        "indexed_count": len(scored),
        "card_detected": detected,
        "device": DEVICE,
        "model": MODEL_NAME,
    }

@app.post("/external-rank")
def external_rank(req: ExternalRankRequest) -> dict[str, Any]:
    source = decode_image(req.image_base64)
    cropped, detected = crop_card(source)
    query_emb = embedding_for_pil(cv_to_pil(cropped))

    ranked = []
    for item in req.candidates[:30]:
        image_url = normalized_remote_url(str(item.image or ""))
        emb = remote_image_embedding(image_url)
        if emb is None:
            continue

        score = float((query_emb @ emb.T).item())
        row = item.model_dump()
        row["image"] = image_url
        row["visual_similarity"] = max(0.0, min(1.0, score))
        ranked.append(row)

    ranked.sort(key=lambda x: x["visual_similarity"], reverse=True)
    limit = max(1, min(int(req.limit or 10), 20))

    return {
        "ok": True,
        "matches": ranked[:limit],
        "candidate_count": len(req.candidates),
        "compared_count": len(ranked),
        "card_detected": detected,
        "device": DEVICE,
        "model": MODEL_NAME,
    }
