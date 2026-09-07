import Link from "next/link";
import styles from "./v4-preview.module.css";

const bikeRows = [
  { date: "15 Apr 2025", make: "Honda CBR650R", year: "2023", mileage: "24,000", location: "SG2", status: "New", image: "/images/style-categories/super-sports.png" },
  { date: "14 Apr 2025", make: "Yamaha MT-07", year: "2022", mileage: "8,500", location: "CV4", status: "New", image: "/images/style-categories/roadster.png" },
  { date: "14 Apr 2025", make: "Kawasaki Z900", year: "2021", mileage: "12,300", location: "LS12", status: "New", image: "/images/style-categories/125cc.png" },
  { date: "13 Apr 2025", make: "Triumph Street Triple", year: "2020", mileage: "15,200", location: "B31", status: "Viewed", image: "/images/style-categories/roadster.png" },
  { date: "12 Apr 2025", make: "BMW S1000RR", year: "2019", mileage: "18,400", location: "M20", status: "Viewed", image: "/images/style-categories/super-sports.png" },
];

export function MotorLeadsPreviewLogo() {
  return <div className={styles.logo}>Motor<span>Leads</span><small>Sell smarter. Ride further.</small></div>;
}

export function DealerLoginV4Preview() {
  return <main className={styles.loginPage}>
    <section className={styles.loginHero}>
      <Link className={styles.loginBack} href="/">← Back to website</Link>
      <div className={styles.loginCopy}>
        <MotorLeadsPreviewLogo />
        <h1>Dealer access to quality motorcycle <span>opportunities</span></h1>
        <p>Join a network of verified motorcycle dealers and get access to genuine seller opportunities across the UK.</p>
        <ul>
          <li>Real seller enquiries</li>
          <li>High quality, verified motorcycles</li>
          <li>A simple, secure platform</li>
        </ul>
      </div>
      <p className={styles.scribble}>The right bikes. The right buyers.</p>
    </section>
    <section className={styles.loginLower}>
      <article className={styles.loginCard}>
        <h2>Dealer login</h2>
        <p>Log in to access your MotorLeads dealer portal.</p>
        <label className={styles.field}>Email address<input placeholder="yourname@dealership.co.uk" type="email" /></label>
        <label className={`${styles.field} ${styles.password}`}>Password<input placeholder="Enter your password" type="password" /><span>◉</span></label>
        <div className={styles.loginOptions}>
          <label><input type="checkbox" defaultChecked /> Remember me</label>
          <a href="#">Forgot password?</a>
        </div>
        <button className={styles.orangeButton} type="button">Log in →</button>
        <div className={styles.divider}>or</div>
        <a className={styles.outlineButton} href="#">Request dealer access →</a>
        <a className={styles.loginNetwork} href="#">Not a dealer yet? Join our verified dealer network</a>
      </article>
      <aside className={styles.benefitColumn}>
        <Benefit icon={<ShieldIcon />} title="Verified dealer network">All dealers are reviewed and approved before access is granted.</Benefit>
        <Benefit icon={<ChartIcon />} title="Genuine opportunities">Access real seller motorcycle enquiries, not duplicated or low quality leads.</Benefit>
        <Benefit icon={<LockIcon />} title="Secure and confidential">Your account and all data is protected with industry standard security.</Benefit>
        <Benefit icon={<SupportIcon />} title="Support when you need it">Our team is here to help if you have any questions.</Benefit>
        <div className={styles.quote}>
          <p>“A straightforward way to connect with genuine sellers. Great platform.”</p>
          <p>– MotorLeads verified dealer preview</p>
        </div>
        <p className={`${styles.scribble} ${styles.lowerScribble}`}>More opportunities ahead.</p>
      </aside>
    </section>
  </main>;
}

function Benefit({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div className={styles.benefitItem}>{icon}<div><strong>{title}</strong><p>{children}</p></div></div>;
}

export function DealerPortalV4Preview() {
  return <main className={styles.app}>
    <aside className={styles.sidebar}>
      <MotorLeadsPreviewLogo />
      <nav aria-label="Dealer Portal preview">
        <NavItem active icon={<HomeIcon />} label="Dashboard" />
        <NavItem icon={<DocIcon />} label="Opportunities" badge="3" />
        <NavItem icon={<TagIcon />} label="Make an offer" />
        <NavItem icon={<MailIcon />} label="My offers" />
        <NavItem icon={<MailIcon />} label="Messages" />
        <NavItem icon={<BuildingIcon />} label="My dealership" />
        <NavItem icon={<GearIcon />} label="Account settings" />
        <NavItem icon={<HelpIcon />} label="Help & support" />
      </nav>
      <Link className={styles.sidebarBack} href="/">← Back to website</Link>
    </aside>
    <section className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.topbarBrand}><div className={styles.logo}>Motor<span>Leads</span></div><small>Dealer Portal</small></div>
        <div className={styles.topActions}><span className={styles.bell}>◦<b>3</b></span><span>Help</span><span className={styles.profile}>○</span><span>Dealership Name ▾</span></div>
      </header>
      <section className={styles.dashboard}>
        <div className={styles.dashboardHeader}>
          <div><h1>Welcome back, James</h1><p>Here&apos;s what&apos;s happening with your opportunities.</p></div>
          <span className={styles.dashboardDate}>Tuesday 15 April 2025</span>
        </div>
        <section className={styles.metrics}>
          <Metric icon={<DocIcon />} value="12" label="New opportunities" detail="in the last 7 days" />
          <Metric icon={<ClockIcon />} value="28" label="Active opportunities" detail="available to view" />
          <Metric icon={<TagIcon />} value="5" label="Offers submitted" detail="this month" />
          <Metric icon={<CheckIcon />} value="2" label="Vehicles won" detail="this month" green />
        </section>
        <Panel title="Latest opportunities" link="View all opportunities →">
          <div className={styles.opTable}>
            <div className={styles.tableHead}><span>Date</span><span>Make & model</span><span>Year</span><span>Mileage</span><span>Location</span><span>Status</span><span>Actions</span></div>
            {bikeRows.map(row => <div className={styles.tableRow} key={`${row.date}-${row.make}`}>
              <span>{row.date}</span>
              <span className={styles.bikeCell}><img src={row.image} alt="" /><strong>{row.make}</strong></span>
              <span>{row.year}</span>
              <span>{row.mileage}</span>
              <span>{row.location}</span>
              <span className={`${styles.status} ${row.status === "Viewed" ? styles.viewed : ""}`}>{row.status}</span>
              <a className={styles.detailsButton} href="#">View details</a>
            </div>)}
          </div>
        </Panel>
        <section className={styles.lowerGrid}>
          <Panel title="Recent activity" link="View all activity →">
            <div className={styles.compactRows}>
              <div className={styles.compactRow}><span>14 Apr</span><strong>Yamaha MT-07</strong><span>£4,800</span><span className={styles.pill}>Pending</span></div>
              <div className={styles.compactRow}><span>12 Apr</span><strong>Triumph Street Triple</strong><span>£5,250</span><span className={styles.pill}>Under review</span></div>
              <div className={styles.compactRow}><span>10 Apr</span><strong>Kawasaki Z650</strong><span>£4,200</span><span className={styles.pill}>Not accepted</span></div>
              <div className={styles.compactRow}><span>8 Apr</span><strong>Honda CB650R</strong><span>£5,000</span><span className={styles.pill}>Offer received</span></div>
            </div>
          </Panel>
          <Panel title="Notifications" link="View all notifications →">
            <div className={styles.noteList}>
              <Note colour="blue" title="New opportunity available" detail="Honda CBR650R (2023)" time="2 hours ago" />
              <Note colour="green" title="Your offer has been viewed" detail="Triumph Street Triple (2020)" time="4 hours ago" />
              <Note colour="green" title="New opportunity available" detail="Yamaha MT-07 (2022)" time="1 day ago" />
              <Note colour="red" title="Offer update" detail="Kawasaki Z650 (2021)" time="2 days ago" />
            </div>
          </Panel>
        </section>
        <aside className={styles.tip}>
          <LightbulbIcon />
          <p><strong>Tip:</strong> Complete your dealership profile to help us match you with more relevant opportunities.</p>
          <a href="#">Update my profile →</a>
        </aside>
      </section>
    </section>
  </main>;
}

function NavItem({ icon, label, badge, active = false }: { icon: React.ReactNode; label: string; badge?: string; active?: boolean }) {
  return <span className={`${styles.navItem} ${active ? styles.active : ""}`}>{icon}<span>{label}</span>{badge && <b className={styles.navBadge}>{badge}</b>}</span>;
}

function Metric({ icon, value, label, detail }: { icon: React.ReactNode; value: string; label: string; detail: string; green?: boolean }) {
  return <article className={styles.metric}>{icon}<div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div></article>;
}

function Panel({ title, link, children }: { title: string; link: string; children: React.ReactNode }) {
  return <article className={styles.panel}><header className={styles.panelHeader}><h2>{title}</h2><a href="#">{link}</a></header>{children}</article>;
}

function Note({ colour, title, detail, time }: { colour: "blue" | "green" | "red"; title: string; detail: string; time: string }) {
  return <div className={styles.note}><span className={`${styles.dot} ${colour === "green" ? styles.green : colour === "red" ? styles.red : ""}`} /><p><strong>{title}</strong>{detail}</p><time>{time}</time></div>;
}

function IconShell({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

function HomeIcon() { return <IconShell><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></IconShell>; }
function DocIcon() { return <IconShell><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h6" /></IconShell>; }
function TagIcon() { return <IconShell><path d="M20 12 12 20 4 12V4h8z" /><circle cx="9" cy="9" r="1.4" /></IconShell>; }
function MailIcon() { return <IconShell><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></IconShell>; }
function BuildingIcon() { return <IconShell><path d="M5 21V5h14v16" /><path d="M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2" /></IconShell>; }
function GearIcon() { return <IconShell><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3.1h5l.4-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2.1-1.5a7 7 0 0 0 .1-1z" /></IconShell>; }
function HelpIcon() { return <IconShell><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.5 2.5 0 1 1 4.5 1.5c-.9.8-1.8 1.2-1.8 2.5" /><path d="M12 17h.01" /></IconShell>; }
function ShieldIcon() { return <IconShell><path d="M12 3 19 6v5c0 4.5-2.8 8.2-7 10-4.2-1.8-7-5.5-7-10V6z" /><path d="m9 12 2 2 4-5" /></IconShell>; }
function ChartIcon() { return <IconShell><path d="M4 20V10" /><path d="M10 20V5" /><path d="M16 20v-8" /><path d="M22 20H2" /><path d="m15 8 2-2 3 3" /></IconShell>; }
function LockIcon() { return <IconShell><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></IconShell>; }
function SupportIcon() { return <IconShell><path d="M4 13a8 8 0 0 1 16 0" /><path d="M5 13h3v5H5z" /><path d="M16 13h3v5h-3z" /><path d="M19 18c0 2-2 3-5 3" /></IconShell>; }
function ClockIcon() { return <IconShell><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></IconShell>; }
function CheckIcon() { return <IconShell><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></IconShell>; }
function LightbulbIcon() { return <IconShell><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8 14a6 6 0 1 1 8 0c-.8.7-1 1.5-1 2H9c0-.5-.2-1.3-1-2z" /></IconShell>; }
