export const PUBLIC_STYLES=["Scooters","125cc","Super Sports","Roadster","Adventure","Custom"] as const;
export type PublicStyle=(typeof PUBLIC_STYLES)[number];

type StyleBike={make:string;model:string;variant:string;bodyStyle:string;category:string;description:string;engineCc:number};
const haystack=(bike:StyleBike)=>[bike.make,bike.model,bike.variant,bike.bodyStyle,bike.category,bike.description].join(" ").toLowerCase();

export function matchesPublicStyle(bike:StyleBike,style:string){
  const text=haystack(bike);
  switch(style){
    case "125cc":return bike.engineCc>=110&&bike.engineCc<=140||/\b125\b/.test(text);
    case "Scooters":return /scooter|moped|maxi[ -]?scooter|step[ -]?through|vespa/.test(text);
    case "Super Sports":return /super ?sport|sports? bike|panigale|fireblade|gsx-?r|yzf-?r|cbr\d*rr|zx-?\d+r|ninja/.test(text);
    case "Roadster":return /roadster|naked|streetfighter|street triple|speed triple|\bmt-?\d|\bz\d{3,4}\b|\bcb\d+[fr]?\b/.test(text);
    case "Adventure":return /adventure|dual sport|africa twin|v-?strom|tenere|multistrada|transalp|r\s?\d{3,4}\s?gs|tiger \d/.test(text);
    case "Custom":return /custom|cruiser|bobber|chopper|bonneville|softail|sportster|rebel/.test(text);
    default:return true;
  }
}

export function publicStyleForBike(bike:StyleBike){return PUBLIC_STYLES.find(style=>matchesPublicStyle(bike,style))??""}
