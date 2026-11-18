import type { Page } from '@playwright/test'
import { defaultNet } from '../src/lib/firebaseRest'
import type { fakeFirebase } from '../src/test/fakeFirebase'

// The browser asks permission (a preflight) before sending a signed-in request to another site
const allow = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' }

/** Answers the page's requests to Google's sign-in and Firestore servers from a stand-in, so no test touches the network. */
export async function standInForGoogle(page: Page, google: ReturnType<typeof fakeFirebase>) {
  for (const host of Object.values(defaultNet().hosts)) {
    await page.route(`${host}/**`, (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: allow })
      try {
        const { status, json } = google.handle(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() ?? undefined })
        return route.fulfill({ status, headers: allow, contentType: 'application/json', body: JSON.stringify(json) })
      } catch {
        return route.abort('internetdisconnected') // the stand-in is "offline"
      }
    })
  }
}
