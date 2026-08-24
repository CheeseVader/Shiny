export function parseCsv(text){
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<String(text||'').length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'&&q&&next==='"'){cell+='"';i++;continue;}
    if(ch==='"'){q=!q;continue;}
    if(ch===','&&!q){row.push(cell);cell='';continue;}
    if((ch==='\n'||ch==='\r')&&!q){
      if(ch==='\r'&&next==='\n')i++;
      row.push(cell);cell='';
      if(row.some(x=>String(x).trim()!==''))rows.push(row);
      row=[];continue;
    }
    cell+=ch;
  }
  if(cell||row.length){row.push(cell);if(row.some(x=>String(x).trim()!==''))rows.push(row);}
  if(!rows.length)return [];
  const headers=rows.shift().map(h=>String(h).trim());
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,String(r[i]??'').trim()])));
}
export function toCsv(rows){
  if(!rows?.length)return '';
  const h=Object.keys(rows[0]);
  const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  return [h.map(q).join(','),...rows.map(r=>h.map(k=>q(r[k])).join(','))].join('\r\n');
}
export function downloadText(name,text,type='text/csv;charset=utf-8'){
  const blob=new Blob(['\ufeff'+text],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
