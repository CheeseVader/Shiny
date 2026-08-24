const buckets=new Map();

export function rateLimit({windowMs=15*60*1000,max=20,keyPrefix='GENERIC'}={}){
  return (req,res,next)=>{
    const now=Date.now();
    const key=`${keyPrefix}:${req.ip||req.socket?.remoteAddress||'unknown'}`;
    let b=buckets.get(key);
    if(!b||now-b.start>=windowMs)b={start:now,count:0};
    b.count++;
    buckets.set(key,b);
    if(b.count>max){
      const retry=Math.max(1,Math.ceil((windowMs-(now-b.start))/1000));
      res.setHeader('Retry-After',String(retry));
      return res.status(429).json({success:false,error:'TOO_MANY_ATTEMPTS'});
    }
    next();
  };
}
