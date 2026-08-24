import { createContext,useContext,useEffect,useMemo,useState } from 'react';

const CartContext=createContext(null);
const KEY='GMX_PUBLIC_CART_V1';

export function CartProvider({children}){
  const [items,setItems]=useState(()=>{
    try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch{return [];}
  });

  useEffect(()=>{localStorage.setItem(KEY,JSON.stringify(items));},[items]);

  function addItem(item,qty=1){
    setItems(current=>{
      const key=`${item.type}:${item.id}`;
      const found=current.find(x=>x.key===key);
      const rawStock=Number(item.stock);
      const max=Number.isFinite(rawStock)&&rawStock>0?rawStock:999999;
      if(found){
        return current.map(x=>x.key===key?{...x,quantity:Math.min(max,x.quantity+qty)}:x);
      }
      return [...current,{...item,key,quantity:Math.min(max,Math.max(1,qty))}];
    });
  }
  function setQuantity(key,qty){
    setItems(current=>current.map(x=>x.key===key?{...x,quantity:Math.max(1,Math.min((Number.isFinite(Number(x.stock))&&Number(x.stock)>0?Number(x.stock):999999),Number(qty||1)))}:x));
  }
  function removeItem(key){setItems(current=>current.filter(x=>x.key!==key));}
  function clear(){setItems([]);}
  const count=items.reduce((s,x)=>s+Number(x.quantity||0),0);
  const subtotal=items.reduce((s,x)=>s+Number(x.price||0)*Number(x.quantity||0),0);

  const value=useMemo(()=>({items,addItem,setQuantity,removeItem,clear,count,subtotal}),[items,count,subtotal]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart(){return useContext(CartContext);}
