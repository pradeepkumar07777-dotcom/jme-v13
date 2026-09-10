# Judiciary Made Easy V13 Full App

## Run locally
1. Copy `.env.example` to `.env` and fill production secrets.
2. `npm install`
3. `npm start`
4. Open `http://localhost:3000`

## Android
1. `npm install`
2. `npx cap add android` (if android folder does not exist)
3. `npx cap sync android`
4. `npx cap open android`

The web app is served from `public/` and uses the V13 Express API.


## Production deployment (recommended V13 architecture)

- Deploy the Node/Express app on **Render**.
- Use **Render PostgreSQL** by setting `DATABASE_URL`; the app stores its state in a PostgreSQL `jme_state` table when this variable is present.
- Set `JWT_SECRET` to a long random production secret.
- Configure Razorpay production keys before enabling card/UPI checkout.
- JME also includes a direct UPI intent button using `JME_UPI_ID=8168667655@ptyes`; this is a manual-verification payment path and does not automatically unlock a course.
- Store lesson/media files in **Cloudflare R2** rather than relying on Render's local filesystem.
- Bunny Stream/CDN credentials can be configured with the `BUNNY_*` variables when video delivery is wired to Bunny.
- Point the Hostinger domain to Render and use HTTPS. Update `GOOGLE_REDIRECT_URI` to the final HTTPS domain.

### Important before launch

1. Change/remove the seeded admin password (`admin123`) and create a secure production admin account.
2. Replace all demo questions with your verified question bank.
3. Configure production Razorpay, Google Workspace, R2 and Bunny credentials.
4. Test registration, login, course purchase, UPI flow, video playback, tests, admin functions and Android build on staging before launch.
