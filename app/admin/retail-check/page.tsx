"use client";

import { useEffect, useState } from "react";

function KPI({
  title,
  value,
  highlight = false,
  valueClass = "",
}: {
  title: string;
  value: any;
  highlight?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="bg-black border border-zinc-800 rounded-2xl p-4">
      <div className="text-zinc-500 text-xs uppercase tracking-wide">{title}</div>
      <div className={`text-2xl font-bold mt-2 ${highlight ? "text-[#00E51D]" : ""}`}>
        {value ?? "-"}
      </div>
    </div>
  );
}

export default function RetailCheckPage() {
  const [makes, setMakes] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [registration, setRegistration] =
    useState("");
  const [year, setYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [recordId, setRecordId] = useState("");
  const [valuation, setValuation] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState("valuation");
  const [derivative, setDerivative] =
  useState("");

  const [derivativeId, setDerivativeId] =
    useState("");

  const [historyRecords, setHistoryRecords] =
    useState<any[]>([]);

  const [selectedHistoryRecord, setSelectedHistoryRecord] =
    useState<any>(null);

  useEffect(() => {
    async function loadData() {
      const makesResponse = await fetch("/api/makes");
      setMakes(await makesResponse.json());

      const modelsResponse = await fetch("/api/models");
      setModels(await modelsResponse.json());
    }
    loadData();
  }, []);

  useEffect(() => {

  async function loadHistory() {

    const response =
      await fetch("/api/retail-history");

    const data =
      await response.json();

    setHistoryRecords(data);

  }

  loadHistory();

}, []);

  useEffect(() => {
    if (!recordId) return;

    const interval = setInterval(async () => {
    const response = await fetch(`/api/retail-check/${recordId}`);
    const data = await response.json();
    if (data.Status === "Checked") {
      setValuation(data);
      setStatus("Valuation Complete");
      clearInterval(interval);
    } 
    }, 5000);

    return () => clearInterval(interval);
  }, [recordId]);

  const filteredModels = models
    .filter((m: any) => m.make === selectedMake && m.model)
    .sort((a: any, b: any) =>
      String(a.model).localeCompare(String(b.model))
    );

  async function lookupRegistration() {

  const response = await fetch(
    "/api/vrm-lookup",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vrm: registration,
      }),
    }
  );

  const data = await response.json();

  const vehicle = data?.vehicle ?? {};
  const make = vehicle.make?.display_name ?? vehicle.make?.map_id ?? vehicle.make ?? "";
  const model = vehicle.model ?? vehicle.genericModel?.display_name ?? "";
  setSelectedMake(String(make));
  setSelectedModel(String(model));
  setYear(String(vehicle.year ?? vehicle.manufactureYear ?? ""));

  setDerivative(String(vehicle.derivative ?? vehicle.variant ?? ""));
  setDerivativeId(String(vehicle.derivativeId ?? vehicle.derivative_id ?? ""));

}

  async function checkMarket() {
    try {
      setLoading(true);

      const response = await fetch("/api/retail-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration,
          make: selectedMake,
          model: selectedModel,
          year,
          mileage,
          askingPrice,
        }),
      });

      const data = await response.json();

      setSelectedHistoryRecord(null);
      setValuation(null);

      setActiveTab("valuation");

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

      setStatus("Waiting for market analysis...");
      setRecordId(data.recordId); 
    } catch (error) {
      console.error(error);
      alert("Failed to create Retail Check");
    } finally {
      setLoading(false);
    }
  }

  const displayedValuation =
  selectedHistoryRecord || valuation;

  const marketRetail =
  Number(displayedValuation?.["Market Retail"]) || 0;

  const hasOfferPrice =
    offerPrice !== "";

  const profit =
    hasOfferPrice
      ? marketRetail - Number(offerPrice)
      : null;

  const margin =
    hasOfferPrice && marketRetail > 0
      ? ((profit! / marketRetail) * 100).toFixed(1)
      : null;

  const bikeHistory =
  historyRecords.sort(
    (a: any, b: any) =>
      new Date(b.createdTime).getTime() -
      new Date(a.createdTime).getTime()
  );

  return (
    <main className="dealer-module min-h-screen text-white">
      <div className="mx-auto max-w-[1500px] p-4 md:p-8">
        <div className="mb-6">
          <h1 className="text-4xl font-bold">Retail Checker</h1>
          <p className="text-zinc-400">AutoTrader / CAP Dealer Dashboard</p>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <aside className="col-span-12 lg:col-span-3 bg-[#151515] border border-zinc-800 rounded-3xl p-6 h-fit lg:sticky lg:top-6">
            <h2 className="font-bold text-xl mb-5">Bike Details</h2>

            <div className="space-y-4 mb-4">


              <input
                type="text"
                placeholder="Registration"
                value={registration}
                onChange={(e) =>
                  setRegistration(
                    e.target.value.toUpperCase()
                  )
                }
                className="flex-1 p-4 rounded-xl bg-black border border-zinc-700"
              />

              <input
                type="number"
                placeholder="Mileage"
                value={mileage}
                onChange={(e)=>setMileage(e.target.value)}
                className="w-full p-4 rounded-xl bg-black border border-zinc-700"
              />

            </div>

            {derivative && (
              <div className="text-green-400 text-sm mt-2">
                {derivative}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowManualSearch(!showManualSearch)}
              className="text-zinc-400 text-sm hover:text-white mb-4"
            >
              {showManualSearch
                ? "Hide Manual Search ▲"
                : "Manual Search ▼"}
            </button>

            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">

                <select
                  value={selectedMake}
                  onChange={(e)=>{
                    setSelectedMake(e.target.value);
                    setSelectedModel("");
                  }}
                  className="w-full p-4 rounded-xl bg-black border border-zinc-700"
                >
                  <option>Select Make</option>

                  {makes
                    .filter((m:any)=>m?.make)
                    .sort((a:any,b:any)=>
                      String(a.make).localeCompare(String(b.make))
                    )
                    .map((m:any)=>(
                      <option key={m.make} value={m.make}>
                        {m.make}
                      </option>
                    ))}
                </select>

                <select
                  value={selectedModel}
                  onChange={(e)=>setSelectedModel(e.target.value)}
                  className="w-full p-4 rounded-xl bg-black border border-zinc-700"
                >
                  <option>Select Model</option>

                  {filteredModels.map((m:any)=>(
                    <option
                      key={`${m.make}-${m.model}`}
                      value={m.model}
                    >
                      {m.model}
                    </option>
                  ))}
                </select>

              </div>

              <div className="grid grid-cols-2 gap-3">

                <input
                  type="number"
                  placeholder="Year"
                  value={year}
                  onChange={(e)=>setYear(e.target.value)}
                  className="w-full p-4 rounded-xl bg-black border border-zinc-700"
                />

                <input
                  type="number"
                  placeholder="Mileage"
                  value={mileage}
                  onChange={(e)=>setMileage(e.target.value)}
                  className="w-full p-4 rounded-xl bg-black border border-zinc-700"
                />

              </div>
              

              <button onClick={checkMarket} disabled={loading} className="w-full bg-[#00E51D] text-black font-bold py-4 rounded-xl">
                {loading ? "Creating..." : "Check Market"}
              </button>

             {status && (
              <div className="bg-black border border-zinc-800 rounded-xl p-4">

                <div className="font-semibold text-white mb-3">
                  {status}
                </div>

                {status !== "Valuation Complete" ? (
                  <>
                    <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#00E51D] h-2 animate-pulse"
                        style={{ width: "75%" }}
                      />
                    </div>

                    <div className="text-zinc-400 text-sm mt-3">
                      Searching market listings and analysing comparable bikes...
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#00E51D] h-2"
                        style={{ width: "100%" }}
                      />
                    </div>

                    <div className="text-[#00E51D] text-sm mt-3 font-semibold">
                      Analysis complete
                    </div>
                  </>
                )}

              </div>
            )}
            </div>
          </aside>

          <section className="col-span-12 lg:col-span-9">
            {valuation && (
              <div className="bg-[#151515] border border-zinc-800 rounded-3xl p-6 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-bold">
                      {displayedValuation.Make} {displayedValuation.Model}
                    </h2>

                    <p className="text-zinc-400">
                      {displayedValuation.Year} • {displayedValuation.Mileage} miles
                    </p>
                  </div>

                  <div className="bg-black border border-[#00E51D] rounded-2xl px-6 py-4">
                    <div className="text-zinc-400 text-sm">Buy Decision</div>
                    <div className="text-3xl font-bold text-[#00E51D]">
                      {displayedValuation["Buy Decision"]}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-[#151515] border border-zinc-800 rounded-3xl overflow-hidden">
              <div className="flex border-b border-zinc-800">
                {["vehicle","valuation","comparables","history"].map(tab=>(
                  <button
                    key={tab}
                    onClick={()=>setActiveTab(tab)}
                    className={`px-6 py-4 capitalize font-semibold ${activeTab===tab ? "text-[#00E51D] border-b-2 border-[#00E51D]" : "text-zinc-400"}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {!valuation && activeTab !== "history" && (
                  <div className="text-zinc-400">
                    
                  </div>
                )}

                {displayedValuation && activeTab==="valuation" && (
                  <>


                  {selectedHistoryRecord && (

                    <button
                      onClick={() =>
                        setSelectedHistoryRecord(null)
                      }
                      className="
                        mb-4
                        bg-[#00E51D]
                        text-black
                        px-4
                        py-2
                        rounded-lg
                        font-bold
                      "
                    >

                      Return To Current Valuation

                    </button>

                  )}
                    <div className="grid lg:grid-cols-2 gap-6 mb-6">

                      <div className="bg-black border border-zinc-800 rounded-2xl p-5">
                        <h3 className="text-xl font-bold mb-4 text-[#00E51D]">
                          AutoTrader Market
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                          <KPI
                            title="Market Retail"
                            value={`£${displayedValuation["Market Retail"] || 0}`}
                          />

                          <KPI
                            title="Fast Sale"
                            value={`£${displayedValuation["Fast Sale Retail"] || 0}`}
                          />

                          <KPI
                            title="Premium Retail"
                            value={`£${displayedValuation["Premium Retail"] || 0}`}
                          />

                          <KPI
                            title="Comparables"
                            value={displayedValuation["Comparable Count"] || 0}
                          />

                          <KPI
                            title="Confidence"
                            value={displayedValuation["Confidence"] || "-"}
                          />

                          <KPI
                            title="Opportunity Score"
                            value={displayedValuation["Opportunity Score"] || 0}
                          />
                        </div>
                      </div>

                      <div className="bg-black border border-zinc-800 rounded-2xl p-5">
                        <h3 className="text-xl font-bold mb-4 text-blue-400">
                          Percayso / CAP
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                          <KPI
                            title="Retail"
                            value={`£${displayedValuation["Percayso Retail"] || 0}`}
                          />

                          <KPI
                            title="Trade"
                            value={`£${displayedValuation["Percayso Trade"] || 0}`}
                          />

                          <KPI
                            title="Independent"
                            value={`£${displayedValuation["Percayso Independent"] || 0}`}
                          />

                          <KPI
                            title="Franchise"
                            value={`£${displayedValuation["Percayso Franchise"] || 0}`}
                          />

                          <KPI
                            title="Days To Sale"
                            value={displayedValuation["Percayso Days To Sale"] || "-"}
                          />

                        </div>
                      </div>

                    </div>

                    <div className="bg-black border border-zinc-800 rounded-2xl p-5">
                      <h3 className="text-xl font-bold mb-4">
                        Buying Metrics
                      </h3>

                      <div className="mb-4">
                        <input
                          type="number"
                          placeholder="Offer Price"
                          value={offerPrice}
                          onChange={(e) => setOfferPrice(e.target.value)}
                          className="w-full p-4 rounded-xl bg-[#111] border border-zinc-700"
                        />
                      </div>

                      <div className="grid md:grid-cols-6 gap-4">
                        <KPI
                          title="Maximum Offer"
                          value={`£${displayedValuation["Suggested Offer"] || 0}`}
                          highlight
                        />

                        <KPI
                          title="Target Profit"
                          value={`£${displayedValuation["Target Profit"] || 0}`}
                          highlight
                        />

                        <KPI
                          title="Days To Sale"
                          value={displayedValuation["Percayso Days To Sale"] || "-"}
                        />

                        <KPI
                          title="Buy Decision"
                          value={
                            displayedValuation["Opportunity Score"] >= 90
                              ? "BUY"
                              : displayedValuation["Opportunity Score"] >= 75
                              ? "REVIEW"
                              : "PASS"

                          }

                          valueClass={
                            displayedValuation["Opportunity Score"] >= 90
                              ? "text-green-400"
                              : displayedValuation["Opportunity Score"] >= 75
                              ? "text-yellow-400"
                              : "text-red-400"
                          }    
                        />

                       <KPI
                          title="Expected Profit"
                          value={
                            profit !== null
                              ? `£${profit.toLocaleString()}`
                              : "-"
                          }
                        />

                        <KPI
                          title="Margin"
                          value={
                            margin !== null
                              ? `${margin}%`
                              : "-"
                          }
                        /> 
                      </div>
                    </div>

                    
                  </>
                )}

                {displayedValuation && activeTab==="vehicle" && (
                  <div className="rounded-2xl border border-zinc-800 bg-black p-8">

                    <div className="text-5xl font-bold text-green-400 mb-3">
                      {displayedValuation.Registration}
                    </div>

                    <div className="text-xl md:text-2xl font-semibold text-white mb-4">
                      {displayedValuation.Make} {displayedValuation.Model}
                    </div>

                  
                    <div className="flex gap-3 mt-4">

                      <div className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700">
                        {displayedValuation.Year}
                      </div>

                      <div className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700">
                        {Number(displayedValuation.Mileage).toLocaleString()} miles
                      </div>

                    </div>   
                  </div>
                )}
                {displayedValuation && activeTab==="comparables" && (
                  <>
                    <div className="mb-4">
                      <h3 className="text-2xl font-bold">
                        {displayedValuation.Make} {displayedValuation.Model}
                      </h3>

                      <p className="text-zinc-400">
                        Comparable AutoTrader adverts used for valuation
                      </p>
                    </div>

                    <div className="flex items-center gap-6 px-4 py-2 text-xs uppercase text-zinc-500 border-b border-zinc-800 mb-2">
                      <div className="w-24">Price</div>
                      <div className="w-16">Year</div>
                      <div className="w-32">Mileage</div>
                      <div className="w-24">Colour</div>
                      <div className="w-16">DOM</div>
                      <div className="w-20">Link</div>
                    </div>


                    <div className="space-y-3">
                      {String(displayedValuation["Comparable Summary"] || "")
                        .split("\n\n")
                        .filter(Boolean)
                        .map((item:string,index:number) => {

                          const lines = item.split("\n");
                          const details = lines[0] || "";
                          const url = lines[1] || "";

                          const parts = details.split("|");

                          const price = parts[0]?.trim() || "";
                          const year = parts[1]?.trim() || "";
                          const mileage = parts[2]?.trim() || "";
                          const colour = parts[3]?.trim() || "";
                          const dom = parts[4]?.trim() || "";

                          return (
                            <div
                              key={index}
                              className="bg-black border-b border-zinc-800 px-4 py-3"
                            >
                              <div className="flex items-center gap-6">

                                <div className="w-24 font-bold text-green-400">
                                  {price}
                                </div>

                                <div className="w-16">
                                  {year}
                                </div>

                                <div className="w-32">
                                  {mileage}
                                </div>

                                <div className="w-24">
                                  {colour || "-"}
                                </div>

                                <div className="w-16">
                                  {dom}
                                </div>

                                <div className="w-20">
                                  {url && (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[#00E51D] hover:underline"
                                    >
                                      View →
                                    </a>
                                  )}
                                </div>

                              </div>
                            </div>
                          ); 
                        })}
                    </div>
                
                  </>
                )}

                {activeTab==="history" && (


                

  <div className="space-y-4">

    <div className="flex items-center justify-between">
      <h3 className="text-xl font-bold">
        Previous Valuations
      </h3>

      <div className="text-sm text-zinc-400">
        {bikeHistory.length} records found
      </div>
    </div>

    <div className="overflow-hidden rounded-2xl border border-zinc-800">

      <table className="w-full">

        <thead>

          <tr className="bg-black">

            <th className="text-left p-4">
              Date
            </th>

              <th className="text-left p-4">
                Bike
              </th>

            <th className="text-left p-4">
              Retail
            </th>

            <th className="text-left p-4">
              Margin
            </th>

            <th className="text-left p-4">
              Score
            </th>

          </tr>

        </thead>

        <tbody>

          {bikeHistory.map((record: any) => (

            <tr
              key={record.id}
              onClick={() => {

                setSelectedHistoryRecord(
                  record
                );

                setActiveTab(
                  "valuation"
                );

              }}
              className="
                border-t
                border-zinc-800
                cursor-pointer
                hover:bg-zinc-900
              "
            >

              <td className="p-4">
                {record["Last Checked"]}
              </td>

              <td className="p-4">

                <div className="font-semibold">
                  {record.Registration}
                </div>

                <div className="text-zinc-300">
                  {record.Make}
                </div>

                <div className="text-zinc-500 text-sm">
                  {record.Model}
                </div>

              </td>

              <td className="p-4">
                £{record["Market Retail"]}
              </td>

              <td className="p-4 text-[#00E51D]">
                £{record["Available Margin"]}
              </td>

              <td className="p-4">
                {record["Opportunity Score"]}
              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  </div>
)}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
