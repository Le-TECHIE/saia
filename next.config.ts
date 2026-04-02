import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/SAIA-Nomination-Guidelines.pdf",
        headers: [
          { key: "Content-Disposition", value: "inline" },
          { key: "Content-Type", value: "application/pdf" },
        ],
      },
    ];
  },
};

export default nextConfig;
