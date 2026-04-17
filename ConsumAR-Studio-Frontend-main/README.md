# TIF Studio

TIF Studio is a Next.js app for creating, previewing, resizing, converting, and downloading 3D product models. It supports two main workflows: manual GLB/USDZ upload and 3D model generation from multiple product images.

## What This App Does

- Upload and preview GLB and USDZ files
- Generate a 3D model from product images
- Edit model proportions and dimensions
- Convert GLB files to USDZ
- Download the processed 3D assets

## Local App

- App URL: CPU Instance : [http://13.232.237.176:3000](http://13.232.237.176:3000)
           GPU Instance : [http://13.233.7.249:3000](http://13.233.7.249:3000)

## Installation

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Notes

- The project reads backend configuration from `.env.local`.
- The CPU instance is currently the active one in `.env.local`.
- GPU URLs are present there as commented alternatives.