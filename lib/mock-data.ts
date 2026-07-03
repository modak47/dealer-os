export type Bike = {
  id: string; make: string; model: string; year: number; mileage: string;
  engine: string; price: number; monthly: number; image: string; category: string;
  colour: string; vrm: string; status: "In Stock" | "Reserved" | "Sold" | "Prep";
};

export const bikes: Bike[] = [
  { id: "kawasaki-z900", make: "Kawasaki", model: "Z900 Performance", year: 2021, mileage: "6,245 miles", engine: "948cc", price: 6995, monthly: 132, category: "Roadster", colour: "Metallic Black", vrm: "AP21 MTO", status: "In Stock", image: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=85" },
  { id: "yamaha-r6", make: "Yamaha", model: "YZF-R6", year: 2020, mileage: "8,112 miles", engine: "599cc", price: 8495, monthly: 158, category: "Super Sports", colour: "Racing Blue", vrm: "YR20 SIX", status: "Reserved", image: "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=85" },
  { id: "bmw-r1250-gs", make: "BMW", model: "R 1250 GS TE", year: 2019, mileage: "12,043 miles", engine: "1,254cc", price: 11495, monthly: 215, category: "Adventure", colour: "Triple Black", vrm: "GS19 BMW", status: "In Stock", image: "https://images.unsplash.com/photo-1558981359-219d6364c9c8?auto=format&fit=crop&w=1200&q=85" },
  { id: "triumph-bobber", make: "Triumph", model: "Bonneville Bobber", year: 2021, mileage: "5,678 miles", engine: "1,200cc", price: 8295, monthly: 154, category: "Custom", colour: "Jet Black", vrm: "BO21 BER", status: "Prep", image: "https://images.unsplash.com/photo-1599819811279-d5ad9cccf838?auto=format&fit=crop&w=1200&q=85" },
  { id: "ducati-panigale-v2", make: "Ducati", model: "Panigale V2", year: 2022, mileage: "3,106 miles", engine: "955cc", price: 13990, monthly: 244, category: "Super Sports", colour: "Ducati Red", vrm: "DU22 CAT", status: "In Stock", image: "https://images.unsplash.com/photo-1525160354320-d8e92641c563?auto=format&fit=crop&w=1200&q=85" },
  { id: "honda-cbr650r", make: "Honda", model: "CBR650R", year: 2021, mileage: "8,902 miles", engine: "649cc", price: 7495, monthly: 135, category: "Super Sports", colour: "Grand Prix Red", vrm: "CB21 RRR", status: "Sold", image: "https://images.unsplash.com/photo-1609630875171-b1321377ee65?auto=format&fit=crop&w=1200&q=85" },
];

export const leads = [
  { name: "James Wilson", email: "james@example.com", phone: "07700 900123", source: "Website", bike: "BMW R 1250 GS TE", message: "Is this available for a viewing on Saturday?", status: "New" },
  { name: "Aisha Rahman", email: "aisha@example.com", phone: "07700 900456", source: "Auto Trader", bike: "Yamaha YZF-R6", message: "Please send me a finance illustration with £1,500 deposit.", status: "Contacted" },
  { name: "Dan Mitchell", email: "dan@example.com", phone: "07700 900789", source: "eBay", bike: "Triumph Bonneville Bobber", message: "I have a Street Twin to part exchange.", status: "New" },
];

export const customers = [
  { name: "James Wilson", email: "james@example.com", phone: "07700 900123", postcode: "B24 9QR", activity: "Enquired 2 hours ago" },
  { name: "Aisha Rahman", email: "aisha@example.com", phone: "07700 900456", postcode: "CV1 2WT", activity: "Finance application yesterday" },
  { name: "Dan Mitchell", email: "dan@example.com", phone: "07700 900789", postcode: "LE2 4AB", activity: "Part exchange enquiry 3 days ago" },
];

export const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
