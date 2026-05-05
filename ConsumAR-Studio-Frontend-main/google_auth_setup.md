# Google Sign-In Setup Guide

To enable "Sign in with Google" in ConsumAR Studio, follow these steps to get your OAuth credentials.

## Step 1: Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Select a project** > **New Project**.
3. Name it `ConsumAR Studio` and click **Create**.

## Step 2: Configure OAuth Consent Screen
1. In the sidebar, go to **APIs & Services** > **OAuth consent screen**.
2. Select **External** and click **Create**.
3. Fill in the required fields:
   - **App name**: `ConsumAR Studio`
   - **User support email**: Your email
   - **Developer contact info**: Your email
4. Click **Save and Continue** through the Scopes and Test Users sections.

## Step 3: Create OAuth 2.0 Credentials
1. Go to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **OAuth client ID**.
3. Select **Web application** for "Application type".
4. Add **Authorized JavaScript origins**:
   - `http://localhost:3000`
5. Add **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google`
6. Click **Create**. You will receive your **Client ID** and **Client Secret**.

## Step 4: Update Your Environment Variables
Update the `.env.local` file in your `ConsumAR-Studio-Frontend-main` directory:

```env
GOOGLE_CLIENT_ID="YOUR_CLIENT_ID_HERE"
GOOGLE_CLIENT_SECRET="YOUR_CLIENT_SECRET_HERE"
```

## Step 5: Restart the App
Stop and restart your Next.js server:
```bash
npm run dev
```
