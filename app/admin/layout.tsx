import {AdminSidebar} from "./admin-sidebar";
export default function AdminLayout({children}:{children:React.ReactNode}){return <div className="admin-shell"><AdminSidebar/><div className="admin-main"><div className="admin-top"><span>Dealer management</span><div><button>?</button><b>AM</b></div></div>{children}</div></div>}
