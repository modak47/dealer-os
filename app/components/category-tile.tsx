"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Arrow } from "./icons";

const categoryDetails:Record<string,{copy:string;icon:string}>={
  Scooters:{copy:"Agile, efficient and built for everyday riding.",icon:"S"},
  "125cc":{copy:"Learner friendly motorcycles ready for the road.",icon:"125"},
  "Super Sports":{copy:"Performance that thrills.",icon:"SS"},
  Roadster:{copy:"Pure riding. No compromises.",icon:"R"},
  Adventure:{copy:"Built for the long way round.",icon:"A"},
  Custom:{copy:"Classic looks. Modern reliability.",icon:"C"},
};

export function CategoryTile({ category, image, count = 0 }: { category: string; image?: string; count?: number }) {
  const [failedImage, setFailedImage] = useState<string>();
  const failed = !image || image === "/bike-placeholder.svg" || failedImage === image;
  // A cached image can fail before React hydrates and attaches onError.
  const checkImage = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth === 0) setFailedImage(image);
  }, [image]);
  const details = categoryDetails[category] ?? {
    copy: `${count} available motorcycle${count === 1 ? "" : "s"} selected by YesMoto.`,
    icon: category.slice(0, 2).toUpperCase(),
  };

  return <Link className="style-card" href={`/stock?category=${encodeURIComponent(category)}`}>
    {failed
      ? <span className="style-card-image style-card-placeholder" aria-hidden="true"><span>{details.icon}</span></span>
      : <span className="style-card-image"><img ref={checkImage} src={image} alt="" onError={() => setFailedImage(image)} /></span>}
    <div className="style-card-body">
      <h3>{category}</h3>
      <p>{details.copy}</p>
      <span className="style-card-action">View bikes <span aria-hidden="true"><Arrow /></span></span>
    </div>
  </Link>;
}
