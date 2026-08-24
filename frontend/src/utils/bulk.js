export async function runBatches(rows,batchSize,worker,onProgress=()=>{}){
  const total=Array.isArray(rows)?rows.length:0;
  const size=Math.max(1,Number(batchSize)||1000);
  let processed=0,ok=0,failed=0;
  const results=[];
  for(let offset=0;offset<total;offset+=size){
    const chunk=rows.slice(offset,offset+size);
    const response=await worker(chunk,offset);
    const data=response?.data||response||{};
    processed+=chunk.length;
    ok+=Number(data.ok??chunk.length);
    failed+=Number(data.failed??0);
    if(Array.isArray(data.results))results.push(...data.results.map(r=>({...r,row:Number(r.row||0)+offset})));
    onProgress({processed,total,ok,failed,percent:total?Math.round(processed*100/total):100});
  }
  return {total,processed,ok,failed,results};
}
