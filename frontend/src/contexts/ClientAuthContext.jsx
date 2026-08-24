import { createContext,useContext,useEffect,useMemo,useState } from 'react';
import { publicApi } from '../services/publicApi.js';

const ClientAuthContext=createContext(null);

export function ClientAuthProvider({children}){
  const [user,setUser]=useState(null);
  const [loading,setLoading]=useState(true);

  async function refresh(){
    try{
      const r=await publicApi('/api/client/me');
      setUser(r.data?.user||null);
    }catch{setUser(null);}
    finally{setLoading(false);}
  }
  useEffect(()=>{refresh();},[]);

  async function login(email,password){
    await publicApi('/api/client/auth/login',{method:'POST',body:JSON.stringify({email,password})});
    const me=await publicApi('/api/client/me');
    setUser(me.data?.user||null);
    return me.data?.user;
  }
  async function register(data){
    const r=await publicApi('/api/client/auth/register',{method:'POST',body:JSON.stringify(data)});
    return r.data;
  }
  async function logout(){
    try{await publicApi('/api/client/auth/logout',{method:'POST'});}catch{}
    setUser(null);
  }

  const value=useMemo(()=>({user,loading,refresh,login,register,logout}),[user,loading]);
  return <ClientAuthContext.Provider value={value}>{children}</ClientAuthContext.Provider>;
}
export function useClientAuth(){return useContext(ClientAuthContext);}
