import Link from "next/link";
import styles from "./v4-preview.module.css";

const bikeRows = [
  { date: "15 Apr 2025", make: "Honda CBR650R", year: "2023", mileage: "24,000", location: "SG2", status: "New", image: "/images/style-categories/super-sports.png" },
  { date: "14 Apr 2025", make: "Yamaha MT-07", year: "2022", mileage: "8,500", location: "CV4", status: "New", image: "/images/style-categories/roadster.png" },
  { date: "14 Apr 2025", make: "Kawasaki Z900", year: "2021", mileage: "12,300", location: "LS12", status: "New", image: "/images/style-categories/125cc.png" },
  { date: "13 Apr 2025", make: "Triumph Street Triple", year: "2020", mileage: "15,200", location: "B31", status: "Viewed", image: "/images/style-categories/roadster.png" },
  { date: "12 Apr 2025", make: "BMW S1000RR", year: "2019", mileage: "18,400", location: "M20", status: "Viewed", image: "/images/style-categories/super-sports.png" },
];

const opportunityRows = [
  { year: "2021", make: "Honda", model: "CB650R", reg: "CB21 XRA", mileage: "7,200 miles", location: "Guildford", distance: "42 miles", asking: "£5,900", check: "Clear", status: "New", image: "/images/style-categories/roadster.png" },
  { year: "2020", make: "Yamaha", model: "MT-07", reg: "MT20 JVR", mileage: "11,850 miles", location: "Chelmsford", distance: "78 miles", asking: "£4,850", check: "Clear", status: "Viewed", image: "/images/style-categories/125cc.png" },
  { year: "2022", make: "Triumph", model: "Street Triple RS", reg: "RX22 LDN", mileage: "6,400 miles", location: "Reading", distance: "64 miles", asking: "£7,250", check: "Advisory", status: "New", image: "/images/style-categories/super-sports.png" },
  { year: "2019", make: "BMW", model: "S1000RR", reg: "BM19 RRF", mileage: "18,400 miles", location: "Maidstone", distance: "48 miles", asking: "£10,400", check: "Clear", status: "Viewed", image: "/images/style-categories/super-sports.png" },
  { year: "2023", make: "Kawasaki", model: "Z900", reg: "KZ23 OPL", mileage: "3,950 miles", location: "Oxford", distance: "91 miles", asking: "£7,950", check: "Clear", status: "New", image: "/images/style-categories/roadster.png" },
  { year: "2018", make: "Ducati", model: "Scrambler Icon", reg: "DU18 SCR", mileage: "15,200 miles", location: "Brighton", distance: "8 miles", asking: "£5,650", check: "Advisory", status: "Saved", image: "/images/style-categories/custom.png" },
];

const workspaceFacts = [
  ["Location", "Guildford"],
  ["Approx distance", "42 miles"],
  ["MOT", "Valid until Apr 2027"],
  ["Vehicle Check", "Clear"],
  ["Owners", "2"],
  ["Keys", "2"],
  ["Service history", "Full history"],
];

const vehicleFacts = [
  ["Registration", "CB21 XRA"],
  ["Make", "Honda"],
  ["Model", "CB650R"],
  ["Year", "2021"],
  ["Engine", "649cc"],
  ["Colour", "Red"],
  ["Mileage", "7,200 miles"],
  ["Owners", "2"],
  ["Keys", "2"],
];

const conditionRows = [
  ["Condition", "Good overall condition with light age-related marks on the tank and bar ends."],
  ["Service history", "Full service history. Last serviced in March 2026 at 6,920 miles."],
  ["Mechanical faults", "None reported by the seller."],
  ["Cosmetic damage", "Small scratch on right mirror casing and minor stone chips on lower fairing."],
  ["Insurance history", "No write-off marker reported."],
  ["Finance", "Seller reports no outstanding finance."],
];

const activeRows = [
  ["2019 Yamaha MT-09 ABS", "Sarah T.", "Brighton", "Negotiating", "£4,350", "Today 08:40"],
  ["2020 Triumph Street Triple", "Mark R.", "Reading", "Offer Made", "£5,250", "Yesterday 16:20"],
  ["2021 Honda CB650R", "Customer locked", "Guildford", "Attempting Contact", "No offer", "2 days ago"],
  ["2018 BMW R nineT", "Amelia W.", "Oxford", "Collection Booked", "£6,800", "3 days ago"],
];

const purchasedRows = [
  ["2021 Kawasaki Z900", "KZ21 OPL", "02 Sep 2026", "£6,950", "£300", "Fee outstanding"],
  ["2020 Yamaha MT-07", "MT20 JVR", "28 Aug 2026", "£4,600", "£300", "Invoiced"],
  ["2019 BMW S1000RR", "BM19 RRF", "19 Aug 2026", "£9,850", "£300", "Paid"],
  ["2018 Ducati Scrambler", "DU18 SCR", "05 Aug 2026", "£5,200", "Credited", "Credited"],
];

const lostRows = [
  ["2021 Honda CB500F", "Lost", "Couldn't agree price", "04 Sep 2026", "Negotiating", "View history"],
  ["2019 Suzuki GSX-S750", "Returned", "Specification unsuitable", "01 Sep 2026", "Contacted", "View details"],
  ["2020 Kawasaki Ninja 650", "Purchased Later", "Customer came back", "27 Aug 2026", "Lost", "Open record"],
  ["2017 Yamaha MT-125 ABS", "Lost", "Too far away", "22 Aug 2026", "Attempting Contact", "View history"],
];

const paymentRows = [
  ["04 Sep 2026", "Kawasaki Z900 · KZ21 OPL", "£300", "£0", "£0", "£300", "Fee outstanding"],
  ["31 Aug 2026", "Yamaha MT-07 · MT20 JVR", "£300", "£300", "£0", "£300", "Invoiced"],
  ["20 Aug 2026", "BMW S1000RR · BM19 RRF", "£300", "£300", "£300", "£0", "Paid"],
  ["10 Aug 2026", "Account credit", "-£150", "£0", "£0", "-£150", "Credit"],
];

const ledgerRows = [
  ["04 Sep", "Successful Purchase Fee", "Kawasaki Z900", "£300"],
  ["31 Aug", "Invoice created", "Yamaha MT-07", "£300"],
  ["20 Aug", "Payment recorded", "BMW S1000RR", "£300"],
  ["10 Aug", "Credit applied", "Goodwill adjustment", "£150"],
];

const dealershipDetails = [
  ["Trading name", "Brighton Motorcycles"],
  ["Business/legal name", "Brighton Motorcycles Ltd"],
  ["Main address", "Unit 4 Seafront Trading Estate, Brighton"],
  ["Postcode", "BN1 9ET"],
  ["Website", "brightonmotorcycles.example"],
  ["Contact name", "James Carter"],
  ["Email", "sales@brightonmotorcycles.example"],
  ["Telephone", "01273 000 420"],
  ["Dealer status", "Active"],
  ["Verification status", "Verified"],
  ["Successful Purchase Fee", "£300 per purchase"],
  ["Joined", "15 April 2025"],
];

const userRows = [
  ["James Carter", "james@brightonmotorcycles.example", "Dealer Admin", "Active", "Today 09:12"],
  ["Maya Patel", "maya@brightonmotorcycles.example", "Dealer User", "Active", "Yesterday 15:44"],
  ["Lewis Grant", "lewis@brightonmotorcycles.example", "Dealer User", "Invited", "Invite sent"],
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
  return <DealerV4Shell active="Dashboard">
      <section className={styles.dashboard}>
        <div className={styles.dashboardHeader}>
          <div><h1>Welcome back, James</h1><p>Here&apos;s what&apos;s happening with your opportunities.</p></div>
          <span className={styles.dashboardDate}>Tuesday 15 April 2025</span>
        </div>
        <section className={styles.metrics}>
          <Metric icon={<DocIcon />} value="12" label="Available opportunities" detail="matched to your dealership" />
          <Metric icon={<ClockIcon />} value="8" label="Active leads" detail="currently being worked" />
          <Metric icon={<CheckIcon />} value="4" label="Purchased" detail="reported this month" green />
          <Metric icon={<ReturnIcon />} value="3" label="Lost / Returned" detail="requires review" />
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
              <Link className={styles.detailsButton} href="/dealer-portal-v4-preview/opportunities">View details</Link>
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
    </DealerV4Shell>;
}

export function DealerOpportunitiesV4Preview() {
  return <DealerV4Shell active="Opportunities">
    <section className={styles.dashboard}>
      <div className={styles.dashboardHeader}>
        <div><h1>Opportunities</h1><p>Motorcycles currently available to your dealership.</p></div>
        <span className={styles.dashboardDate}>6 opportunities matched</span>
      </div>
      <div className={styles.toolbar}>
        <label className={styles.searchBox}>Search<input defaultValue="" placeholder="Search make, model or registration" /></label>
        <label className={styles.selectBox}>Sort<select defaultValue="newest"><option value="newest">Newest first</option><option value="distance">Nearest first</option><option value="asking">Asking price</option></select></label>
        <label className={styles.selectBox}>Vehicle check<select defaultValue="all"><option value="all">All checks</option><option value="clear">Clear only</option><option value="advisory">With advisories</option></select></label>
        <div className={styles.viewToggle} aria-label="View mode"><span className={styles.active}>List</span><span>Cards</span></div>
      </div>
      <Panel title="Available opportunities" link="Updated just now">
        <div className={`${styles.opTable} ${styles.opportunityTable}`}>
          <div className={`${styles.tableHead} ${styles.opportunityHead}`}><span>Motorcycle</span><span>Reg</span><span>Mileage</span><span>Location</span><span>Seller asking</span><span>Vehicle check</span><span>Status</span><span>Action</span></div>
          {opportunityRows.map((row) => <div className={`${styles.tableRow} ${styles.opportunityRow}`} key={row.reg}>
            <span className={styles.bikeCell}><img src={row.image} alt="" /><span><strong>{row.year} {row.make} {row.model}</strong><small>{row.make} acquisition lead</small></span></span>
            <span>{row.reg}</span>
            <span>{row.mileage}</span>
            <span><strong>{row.location}</strong><small>{row.distance}</small></span>
            <span className={styles.price}>{row.asking}</span>
            <span className={`${styles.checkChip} ${row.check === "Advisory" ? styles.warning : ""}`}>{row.check}</span>
            <span className={`${styles.status} ${row.status !== "New" ? styles.viewed : ""}`}>{row.status}</span>
            <Link className={styles.rowAction} href="/dealer-portal-v4-preview/opportunity">View opportunity →</Link>
          </div>)}
        </div>
      </Panel>
    </section>
  </DealerV4Shell>;
}

export function DealerLeadWorkspaceV4Preview({ tab = "overview", state = "available" }: { tab?: LeadTab; state?: "available" | "claimed" }) {
  const isClaimed = state === "claimed";
  return <DealerV4Shell active="Opportunities">
    <section className={styles.dashboard}>
      <Link className={styles.breadcrumb} href="/dealer-portal-v4-preview/opportunities">← Opportunities</Link>
      <section className={styles.leadHeader}>
        <div>
          <span className={styles.status}>{isClaimed ? "Claimed" : "Available"}</span>
          <h1>2021 Honda CB650R</h1>
          <p>CB21 XRA · 7,200 miles · 649cc · Red</p>
        </div>
        <aside className={styles.claimBox}>
          <span>Seller asking</span>
          <strong>£5,900</strong>
          <button className={styles.blueButton} type="button">{isClaimed ? "Working lead" : "Claim opportunity"}</button>
        </aside>
      </section>
      <section className={styles.summaryCells}>
        {workspaceFacts.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>
      <section className={styles.workspaceGrid}>
        <article className={styles.galleryPanel}>
          <div className={styles.mainPhoto}>
            <button type="button" aria-label="Previous photo">‹</button>
            <img src="/images/style-categories/roadster.png" alt="Honda CB650R preview" />
            <button type="button" aria-label="Next photo">›</button>
            <span>1 / 4 photos</span>
          </div>
          <div className={styles.thumbnails}>
            {["/images/style-categories/roadster.png", "/images/style-categories/super-sports.png", "/images/style-categories/125cc.png", "/images/style-categories/custom.png"].map((image, index) => <img className={index === 0 ? styles.selected : ""} src={image} alt="" key={image} />)}
          </div>
        </article>
        <article className={styles.customerLocked}>
          {isClaimed ? <><CheckIcon /><h2>Customer details unlocked</h2><p>Sarah Thompson · Guildford · GU1</p></> : <><LockIcon /><h2>Customer details</h2><p>Customer contact details will be available after you claim this opportunity.</p></>}
        </article>
      </section>
      <nav className={styles.leadTabs} aria-label="Lead workspace preview tabs">
        <LeadTabLink tab="overview" current={tab}>Overview</LeadTabLink>
        <LeadTabLink tab="vehicle-check" current={tab}>Vehicle Check</LeadTabLink>
        <LeadTabLink tab="mot" current={tab}>MOT & Mileage</LeadTabLink>
        <LeadTabLink tab="location" current={tab}>Location</LeadTabLink>
        <LeadTabLink tab="customer" current={tab} claimed>Customer / Work Lead</LeadTabLink>
      </nav>
      {tab === "overview" && <OverviewTab />}
      {tab === "vehicle-check" && <VehicleCheckTab />}
      {tab === "mot" && <MotMileageTab />}
      {tab === "location" && <LocationTab />}
      {tab === "customer" && <CustomerWorkLeadTab claimed={isClaimed} />}
    </section>
  </DealerV4Shell>;
}

type LeadTab = "overview" | "vehicle-check" | "mot" | "location" | "customer";

function LeadTabLink({ tab, current, claimed, children }: { tab: LeadTab; current: LeadTab; claimed?: boolean; children: React.ReactNode }) {
  const href = `/dealer-portal-v4-preview/opportunity?tab=${tab}${claimed ? "&state=claimed" : ""}`;
  return <Link className={current === tab ? styles.active : ""} href={href}>{children}</Link>;
}

function OverviewTab() {
  return <section className={styles.overviewGrid}>
        <Panel title="Bike details" link="Vehicle record">
          <div className={styles.factTable}>
            {vehicleFacts.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </Panel>
        <Panel title="Condition & history" link="Seller supplied">
          <div className={styles.conditionTable}>
            {conditionRows.map(([label, value]) => <div key={label}><span>{label}</span><p>{value}</p></div>)}
          </div>
        </Panel>
        <article className={`${styles.panel} ${styles.commentsPanel}`}>
          <header className={styles.panelHeader}><h2>Seller comments</h2><span>Seller supplied</span></header>
          <p>Very tidy middleweight Honda. Selling because I am moving to a touring bike. Starts first time, rides cleanly and has always been kept in a dry garage.</p>
        </article>
        <article className={`${styles.panel} ${styles.motSummary}`}>
          <header className={styles.panelHeader}><h2>MOT summary</h2><span>Latest result</span></header>
          <div><strong>Passed</strong><p>Valid until 12 April 2027. Advisory: rear tyre close to legal limit.</p></div>
        </article>
      </section>
}

function VehicleCheckTab() {
  const rows = [
    ["Vehicle identity", "VIN and registration match", "Clear"],
    ["Finance", "No finance recorded", "Clear"],
    ["Stolen", "No stolen marker", "Clear"],
    ["Insurance write-off", "No write-off marker", "Clear"],
    ["Scrapped", "No scrapped marker", "Clear"],
    ["Imported", "Not recorded as imported", "Clear"],
    ["Exported", "Not recorded as exported", "Clear"],
    ["Mileage", "Progression looks consistent", "Clear"],
    ["MOT relationship", "MOT history aligns with vehicle identity", "Review"],
  ];
  return <section className={styles.singlePanelGrid}>
    <article className={styles.reportHero}><CheckIcon /><div><h2>Vehicle check clear</h2><p>Core provenance checks are clear. One MOT relationship item is marked for routine review.</p></div></article>
    <article className={styles.panel}>
      <header className={styles.panelHeader}><h2>Vehicle check report</h2><span>Structured result</span></header>
      <div className={styles.reportRows}>{rows.map(([name, detail, state]) => <div key={name}><strong>{name}</strong><p>{detail}</p><span className={`${styles.checkChip} ${state === "Review" ? styles.warning : ""}`}>{state}</span></div>)}</div>
    </article>
  </section>;
}

function MotMileageTab() {
  const tests = [
    { date: "12 Apr 2026", mileage: "6,920", result: "PASS", expiry: "12 Apr 2027", advisories: ["Rear tyre close to legal limit"], failures: [] },
    { date: "03 Apr 2025", mileage: "5,118", result: "PASS", expiry: "03 Apr 2026", advisories: ["Front brake pads wearing thin"], failures: [] },
    { date: "20 Mar 2024", mileage: "3,804", result: "FAIL", expiry: "N/A", advisories: [], failures: ["Headlamp aim too low", "Rear reflector missing"] },
    { date: "22 Mar 2024", mileage: "3,806", result: "PASS", expiry: "22 Mar 2025", advisories: [], failures: [] },
  ];
  return <section className={styles.motLayout}>
    <article className={styles.panel}>
      <header className={styles.panelHeader}><h2>Mileage history</h2><span>Recorded mileage</span></header>
      <div className={styles.mileageChart}>
        <svg viewBox="0 0 520 190" role="img" aria-label="Mileage progression chart">
          <path d="M42 150 H500 M42 110 H500 M42 70 H500 M42 30 H500" />
          <polyline points="42,146 185,118 330,78 480,34" />
          <circle cx="42" cy="146" r="5" /><circle cx="185" cy="118" r="5" /><circle cx="330" cy="78" r="5" /><circle cx="480" cy="34" r="5" />
          <text x="34" y="174">2023</text><text x="172" y="174">2024</text><text x="318" y="174">2025</text><text x="468" y="174">2026</text>
        </svg>
      </div>
    </article>
    <article className={styles.panel}>
      <header className={styles.panelHeader}><h2>MOT tests</h2><span>Chronological record</span></header>
      <div className={styles.motTests}>{tests.map((test, index) => <details key={`${test.date}-${test.mileage}`} open={index < 2}>
        <summary><strong>{test.date}</strong><span>{test.mileage} miles</span><b className={test.result === "PASS" ? styles.pass : styles.fail}>{test.result}</b><small>Expiry: {test.expiry}</small></summary>
        <div>{test.advisories.length > 0 && <p><b>Advisories:</b> {test.advisories.join("; ")}</p>}{test.failures.length > 0 && <p><b>Failure items:</b> {test.failures.join("; ")}</p>}{test.advisories.length === 0 && test.failures.length === 0 && <p>No advisories or failure items recorded for this test.</p>}</div>
      </details>)}</div>
    </article>
  </section>;
}

function LocationTab() {
  return <section className={styles.locationLayout}>
    <article className={styles.mapPreview}><div><LocationIcon /><strong>Approximate area</strong><span>Seller location shown by town only before claim.</span></div></article>
    <article className={styles.panel}>
      <header className={styles.panelHeader}><h2>Location</h2><span>Approximate</span></header>
      <div className={styles.factTable}>
        <div><span>Seller area</span><strong>Guildford</strong></div>
        <div><span>Postcode district</span><strong>GU1</strong></div>
        <div><span>Your dealership</span><strong>BN1 9ET</strong></div>
        <div><span>Distance</span><strong>42 miles from your dealership</strong></div>
      </div>
      <div className={styles.panelActions}><button type="button" className={styles.outlineMini}>View Map</button><button type="button" className={styles.outlineMini}>Directions</button></div>
    </article>
  </section>;
}

function CustomerWorkLeadTab({ claimed }: { claimed: boolean }) {
  if (!claimed) return <section className={styles.singlePanelGrid}>
    <article className={styles.lockedWide}><LockIcon /><h2>Customer details</h2><p>Claim this opportunity to unlock the customer contact details and begin working the lead.</p><button type="button" className={styles.blueButton}>Claim opportunity</button></article>
  </section>;

  return <section className={styles.crmLayout}>
    <article className={styles.panel}>
      <header className={styles.panelHeader}><h2>Customer details</h2><span>Claimed lead</span></header>
      <div className={styles.contactCard}><h3>Sarah Thompson</h3><p>Guildford · GU1</p><div><a href="tel:07123456789">Call 07123 456789</a><a href="mailto:sarah@example.com">Email customer</a></div></div>
    </article>
    <article className={styles.panel}>
      <header className={styles.panelHeader}><h2>Work lead</h2><span>Current state</span></header>
      <div className={styles.workflowChips}>{["Attempting Contact", "Contacted", "Offer Made", "Negotiating", "Agreed", "Collection Booked"].map((step, index) => <span className={index === 3 ? styles.active : ""} key={step}>{step}</span>)}</div>
      <div className={styles.leadStats}><div><span>Seller asking</span><strong>£5,900</strong></div><div><span>Latest offer</span><strong>£5,350</strong></div><div><span>Last activity</span><strong>Today 08:40</strong></div></div>
    </article>
    <article className={styles.panel}>
      <header className={styles.panelHeader}><h2>Activity timeline</h2><span>Chronological</span></header>
      <div className={styles.timeline}>{["Call outcome: customer interested in collection this week", "Email sent with provisional offer", "Offer recorded at £5,350", "Status changed to Negotiating"].map((item, index) => <p key={item}><span>{index + 1}</span>{item}</p>)}</div>
    </article>
    <article className={styles.panel}>
      <header className={styles.panelHeader}><h2>Add activity</h2><span>Lead activity</span></header>
      <div className={styles.mockForm}><select defaultValue="note"><option value="note">Note</option><option value="call">Call outcome</option><option value="offer">Offer</option></select><textarea placeholder="Add a note, call outcome or offer detail" /><button className={styles.blueButton} type="button">Add activity</button></div>
      <div className={styles.terminalActions}><button type="button">Lost</button><button type="button">Return to Pool</button><button type="button">Report Purchase</button></div>
    </article>
  </section>;
}

export function DealerActiveLeadsV4Preview() {
  return <DealerV4Shell active="Active Leads">
    <ListPage title="Active Leads" subtitle="Claimed opportunities currently being worked by your dealership." count="4 active leads">
      <SimpleTable headers={["Motorcycle", "Customer", "Location", "Workflow status", "Latest offer", "Last activity"]} rows={activeRows} action="Open lead →" />
    </ListPage>
  </DealerV4Shell>;
}

export function DealerPurchasedV4Preview() {
  return <DealerV4Shell active="Purchased">
    <ListPage title="Purchased" subtitle="Purchase history and Successful Purchase Fee states." count="4 purchases">
      <SimpleTable headers={["Motorcycle", "Registration", "Purchase date", "Purchase price", "Successful Purchase Fee", "Fee state"]} rows={purchasedRows} action="View purchase →" />
    </ListPage>
  </DealerV4Shell>;
}

export function DealerLostReturnedV4Preview() {
  return <DealerV4Shell active="Lost / Returned">
    <ListPage title="Lost / Returned" subtitle="A useful history of outcomes, return reasons and purchased-later records." count="4 records">
      <SimpleTable headers={["Motorcycle", "Outcome", "Structured reason", "Date", "Previous state", "Details"]} rows={lostRows} action="Open →" />
    </ListPage>
  </DealerV4Shell>;
}

export function DealerPaymentsV4Preview() {
  return <DealerV4Shell active="Payments">
    <section className={styles.dashboard}>
      <div className={styles.dashboardHeader}>
        <div><h1>Payments</h1><p>Read-only account view for Successful Purchase Fees, credits and payments.</p></div>
        <span className={styles.dashboardDate}>Account balance updated today</span>
      </div>
      <section className={styles.metrics}>
        <Metric icon={<TagIcon />} value="£600" label="Outstanding" detail="awaiting settlement" />
        <Metric icon={<DocIcon />} value="£300" label="Invoiced" detail="issued this month" />
        <Metric icon={<CheckIcon />} value="£300" label="Paid" detail="received this month" green />
        <Metric icon={<ReturnIcon />} value="£150" label="Credits" detail="available balance" />
      </section>
      <Panel title="Transactions" link="Read-only ledger">
        <SimpleTable headers={["Date", "Motorcycle / reference", "Fee", "Invoiced", "Paid", "Outstanding", "Status"]} rows={paymentRows} />
      </Panel>
      <section className={styles.lowerGrid}>
        <Panel title="Account activity" link="Recent ledger entries">
          <SimpleTable compact headers={["Date", "Type", "Reference", "Amount"]} rows={ledgerRows} />
        </Panel>
        <Panel title="Account summary" link="Manual invoicing">
          <div className={styles.summaryList}><p><strong>Successful Purchase Fee:</strong> £300 per completed purchase</p><p><strong>Billing method:</strong> Manual invoice</p><p><strong>Account status:</strong> Active and verified</p></div>
        </Panel>
      </section>
    </section>
  </DealerV4Shell>;
}

export function DealerDealershipV4Preview() {
  return <DealerV4Shell active="My Dealership">
    <section className={styles.dashboard}>
      <div className={styles.dashboardHeader}>
        <div><h1>My Dealership</h1><p>Company profile and account information held by MotorLeads.</p></div>
        <button className={styles.blueButton} type="button">Edit profile</button>
      </div>
      <section className={styles.profileGrid}>
        <Panel title="Dealership profile" link="Verified account">
          <div className={styles.factTable}>{dealershipDetails.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        </Panel>
        <Panel title="Account status" link="Summary">
          <div className={styles.statusStack}><div><CheckIcon /><strong>Verified dealer</strong><p>Approved to view and claim suitable opportunities.</p></div><div><TagIcon /><strong>Successful Purchase Fee</strong><p>£300 per completed purchase.</p></div><div><ClockIcon /><strong>Joined</strong><p>15 April 2025</p></div></div>
        </Panel>
      </section>
    </section>
  </DealerV4Shell>;
}

export function DealerSettingsV4Preview() {
  return <DealerV4Shell active="Account Settings">
    <section className={styles.dashboard}>
      <div className={styles.dashboardHeader}>
        <div><h1>Account Settings</h1><p>Buying preferences, geography and dealership user permissions.</p></div>
        <button className={styles.blueButton} type="button">Invite user</button>
      </div>
      <section className={styles.settingsGrid}>
        <Panel title="Buying preferences" link="Dealer Admin editable">
          <div className={styles.preferenceGrid}>
            <div><span>Makes wanted</span><strong>Honda, Yamaha, Triumph, Kawasaki, BMW</strong></div>
            <div><span>Makes excluded</span><strong>Chinese imports, salvage-only brands</strong></div>
            <div><span>Maximum age</span><strong>12 years</strong></div>
            <div><span>Maximum mileage</span><strong>35,000 miles</strong></div>
            <div><span>Engine size</span><strong>300cc to 1200cc</strong></div>
            <div><span>History acceptance</span><strong>Clear, light advisories, finance declared</strong></div>
            <div><span>Base postcode</span><strong>BN1 9ET</strong></div>
            <div><span>Buying radius</span><strong>100 miles</strong></div>
            <div><span>Regions</span><strong>South East, London, East of England</strong></div>
          </div>
        </Panel>
        <Panel title="Dealer users" link="Role controlled">
          <SimpleTable compact headers={["Name", "Email", "Role", "Status", "Last activity"]} rows={userRows} />
          <div className={styles.permissionNote}><strong>Dealer Admin</strong> can manage users and settings. <strong>Dealer User</strong> can work leads but cannot change account settings.</div>
        </Panel>
      </section>
    </section>
  </DealerV4Shell>;
}

export function DealerSupportV4Preview() {
  return <DealerV4Shell active="Help & Support">
    <section className={styles.dashboard}>
      <div className={styles.dashboardHeader}>
        <div><h1>Help & Support</h1><p>Support for using MotorLeads opportunities and account tools.</p></div>
        <Link className={styles.blueButton} href="/">Back to MotorLeads</Link>
      </div>
      <section className={styles.supportGrid}>
        {["Claiming opportunities", "Working active leads", "Reporting a purchase", "Successful Purchase Fees", "Managing dealership users", "Buying preferences"].map((topic) => <article className={styles.supportCard} key={topic}><HelpIcon /><h2>{topic}</h2><p>Guidance for common dealer portal tasks and account questions.</p></article>)}
      </section>
      <article className={`${styles.panel} ${styles.supportContact}`}><h2>Contact MotorLeads support</h2><p>Email support@motorleads.co.uk for help with your dealer account, opportunities or billing questions.</p></article>
    </section>
  </DealerV4Shell>;
}

function ListPage({ title, subtitle, count, children }: { title: string; subtitle: string; count: string; children: React.ReactNode }) {
  return <section className={styles.dashboard}>
    <div className={styles.dashboardHeader}>
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <span className={styles.dashboardDate}>{count}</span>
    </div>
    <Panel title={title} link="Updated just now">{children}</Panel>
  </section>;
}

function SimpleTable({ headers, rows, action, compact = false }: { headers: string[]; rows: string[][]; action?: string; compact?: boolean }) {
  return <div className={`${styles.simpleTable} ${compact ? styles.compactTable : ""}`} style={{ "--cols": `${headers.length + (action ? 1 : 0)}` } as React.CSSProperties}>
    <div className={styles.simpleHead}>{headers.map((header) => <span key={header}>{header}</span>)}{action && <span>Action</span>}</div>
    {rows.map((row, index) => <div className={styles.simpleRow} key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <span className={cellIndex === 0 ? styles.primaryCell : ""} key={`${cell}-${cellIndex}`}>{cell}</span>)}{action && <Link href="/dealer-portal-v4-preview/opportunity?tab=customer&state=claimed">{action}</Link>}</div>)}
  </div>;
}

type NavSection = "Dashboard" | "Opportunities" | "Active Leads" | "Purchased" | "Lost / Returned" | "Payments" | "My Dealership" | "Account Settings" | "Help & Support";

function DealerV4Shell({ active, children }: { active: NavSection; children: React.ReactNode }) {
  return <main className={styles.app}>
    <aside className={styles.sidebar}>
      <MotorLeadsPreviewLogo />
      <nav aria-label="Dealer Portal preview">
        <NavItem active={active === "Dashboard"} href="/dealer-portal-v4-preview" icon={<HomeIcon />} label="Dashboard" />
        <NavItem active={active === "Opportunities"} href="/dealer-portal-v4-preview/opportunities" icon={<DocIcon />} label="Opportunities" badge="3" />
        <NavItem active={active === "Active Leads"} href="/dealer-portal-v4-preview/active" icon={<ClockIcon />} label="Active Leads" />
        <NavItem active={active === "Purchased"} href="/dealer-portal-v4-preview/purchased" icon={<CheckIcon />} label="Purchased" />
        <NavItem active={active === "Lost / Returned"} href="/dealer-portal-v4-preview/lost" icon={<ReturnIcon />} label="Lost / Returned" />
        <NavItem active={active === "Payments"} href="/dealer-portal-v4-preview/payments" icon={<TagIcon />} label="Payments" />
        <NavItem active={active === "My Dealership"} href="/dealer-portal-v4-preview/dealership" icon={<BuildingIcon />} label="My Dealership" />
        <NavItem active={active === "Account Settings"} href="/dealer-portal-v4-preview/settings" icon={<GearIcon />} label="Account Settings" />
        <NavItem active={active === "Help & Support"} href="/dealer-portal-v4-preview/support" icon={<HelpIcon />} label="Help & Support" />
      </nav>
      <Link className={styles.sidebarBack} href="/">← Back to website</Link>
    </aside>
    <section className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.topbarBrand}><div className={styles.logo}>Motor<span>Leads</span></div><small>Dealer Portal</small></div>
        <div className={styles.topActions}><span className={styles.bell}>◦<b>3</b></span><span>Help</span><span className={styles.profile}>○</span><span>Dealership Name ▾</span></div>
      </header>
      {children}
    </section>
  </main>;
}

function NavItem({ icon, label, badge, active = false, href }: { icon: React.ReactNode; label: string; badge?: string; active?: boolean; href?: string }) {
  const content = <>{icon}<span>{label}</span>{badge && <b className={styles.navBadge}>{badge}</b>}</>;
  if (href) return <Link className={`${styles.navItem} ${active ? styles.active : ""}`} href={href}>{content}</Link>;
  return <span className={`${styles.navItem} ${active ? styles.active : ""}`}>{content}</span>;
}

function Metric({ icon, value, label, detail }: { icon: React.ReactNode; value: string; label: string; detail: string; green?: boolean }) {
  return <article className={styles.metric}>{icon}<div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div></article>;
}

function Panel({ title, link, children }: { title: string; link: string; children: React.ReactNode }) {
  const isAction = link.includes("→");
  return <article className={styles.panel}><header className={styles.panelHeader}><h2>{title}</h2>{isAction ? <a href="#">{link}</a> : <span>{link}</span>}</header>{children}</article>;
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
function ReturnIcon() { return <IconShell><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-4" /></IconShell>; }
function LocationIcon() { return <IconShell><path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></IconShell>; }
