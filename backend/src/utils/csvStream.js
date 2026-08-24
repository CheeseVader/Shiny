function csvCell(v){
  if(v===null||v===undefined)return '""';
  const s=v instanceof Date?v.toISOString():typeof v==='object'?JSON.stringify(v):String(v);
  return `"${s.replace(/"/g,'""')}"`;
}
export function writeCsvRows(res,rows,headersState){
  if(!rows.length)return headersState;
  let headers=headersState;
  if(!headers){
    headers=Object.keys(rows[0]);
    res.write('\ufeff'+headers.map(csvCell).join(',')+'\r\n');
  }
  for(const row of rows)res.write(headers.map(h=>csvCell(row[h])).join(',')+'\r\n');
  return headers;
}
