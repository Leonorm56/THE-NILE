import { createMirrorServer } from './libs/mirror'

let mirror = null

/** Start Server */
export function startMirrorServer() {
  return new Promise((resolve, reject) => {
    createMirrorServer()
      .then((data) => {
        /** Store Server */
        mirror = data

        /** Resolve Addresses */
        resolve(mirror.addresses)
      })
      .catch(() => reject({ status: false }))
  })
}

/** Close Server */
export async function stopMirrorServer() {
  if (mirror) {
    await mirror.io.close()
    mirror = null
  }
}

/** Get Server State */
export function getMirrorServerState() {
  return {
    status: mirror !== null,
    addresses: mirror?.addresses
  }
}
