import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Evita que Next detecte un package-lock de una carpeta superior como raíz del proyecto
  turbopack: { root: process.cwd() },
  // Postgres embebido (modo demo) y cliente SQL: se cargan desde node_modules, no se empaquetan
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  experimental: {
    // Subida de documentos (hasta 10 MB) mediante server actions
    serverActions: { bodySizeLimit: "12mb" },
  },
  // Migraciones SQL necesarias en runtime para el modo demo
  outputFileTracingIncludes: {
    "/**": ["./supabase/**/*"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
