import { useEffect, useState } from 'react'
import { LayoutDashboard, ArrowLeftRight, PieChart, Users, Settings, Plus, Bell, Eye, EyeOff, Sun, Moon, LogOut } from 'lucide-react'
import LoginPage from './pages/LoginPage.js'
import DashboardPage from './pages/DashboardPage.js'
import TransactionsPage from './pages/TransactionsPage.js'
import BudgetPage from './pages/BudgetPage.js'
import DebtsPage from './pages/DebtsPage.js'
import OthersPage from './pages/OthersPage.js'
export type NavItem = 'beranda' | 'transaksi' | 'budget' | 'hutang' | 'lainnya'
const labels: Record<NavItem,string> = { beranda:'Beranda', transaksi:'Transaksi', budget:'Budget', hutang:'Hutang', lainnya:'Lainnya' }
const icons: Record<NavItem,React.ReactNode> = { beranda:<LayoutDashboard size={20}/>, transaksi:<ArrowLeftRight size={20}/>, budget:<PieChart size={20}/>, hutang:<Users size={20}/>, lainnya:<Settings size={20}/> }
export default function App() {
 const [auth,setAuth]=useState<boolean|null>(null); const [active,setActive]=useState<NavItem>('beranda'); const [dark,setDark]=useState(()=>document.documentElement.classList.contains('dark')||window.matchMedia('(prefers-color-scheme: dark)').matches); const [privacy,setPrivacy]=useState(false)
 useEffect(()=>{document.documentElement.classList.toggle('dark',dark)},[dark]); useEffect(()=>{fetch('/api/v1/auth/me',{credentials:'include'}).then(r=>setAuth(r.status===200)).catch(()=>setAuth(false))},[])
 const logout=async()=>{try{await fetch('/api/v1/auth/logout',{method:'POST',credentials:'include'})}finally{setAuth(false)}}
 if(auth===null)return <p className="muted">Memuat...</p>; if(!auth)return <LoginPage onLogin={()=>setAuth(true)}/>
 return <div className="app-shell"><aside className="sidebar"><div className="sidebar-brand-name">Kasku</div><div className="sidebar-brand-tag">Keuangan Pribadi</div><div className="sidebar-section">{(Object.keys(labels) as NavItem[]).map(k=><button key={k} className={`sidebar-item${active===k?' sidebar-item--active':''}`} onClick={()=>setActive(k)}>{icons[k]} {labels[k]}</button>)}</div><div className="sidebar-spacer"/><button className="icon-btn" onClick={logout}><LogOut size={16}/></button></aside><div style={{display:'flex',flexDirection:'column',minWidth:0}}><header className="topbar"><span className="topbar-title">Kasku</span><div className="topbar-right"><button className="icon-btn" onClick={()=>setPrivacy(!privacy)}>{privacy?<EyeOff size={18}/>:<Eye size={18}/>}</button><button className="icon-btn" onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><button className="icon-btn"><Bell size={18}/></button><button className="btn btn--ghost" onClick={logout}>Keluar</button></div></header><main className="content">{active==='beranda'&&<DashboardPage/>}{active==='transaksi'&&<TransactionsPage/>}{active==='budget'&&<BudgetPage/>}{active==='hutang'&&<DebtsPage/>}{active==='lainnya'&&<OthersPage/>}</main></div><nav className="bottom-nav">{(Object.keys(labels) as NavItem[]).map(k=><button key={k} className={`nav-item${active===k?' nav-item--active':''}`} onClick={()=>setActive(k)} aria-label={labels[k]}><span className="nav-icon">{icons[k]}</span><span className="nav-label">{labels[k]}</span></button>)}</nav><button className="fab" aria-label="Tambah Transaksi" onClick={()=>setActive('transaksi')}><Plus size={24}/></button></div>
}
