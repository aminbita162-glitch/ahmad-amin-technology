import type { MetadataRoute } from "next";

export default function Manifest(): MetadataRoute.Manifest {
  return {
    name: "Ahmad & Amin Technology 2026",
    short_name: "A&A 2026",
    description: "The exclusive two-brothers app",
    display: "standalone",
    background_color: "#07080c",
    theme_color: "#07080c",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
