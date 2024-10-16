import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as promise from 'lib0/promise'
import * as error from 'lib0/error'
import * as string from 'lib0/string'

export const deriveKey = (
  secret: string,
  roomName: string
): Promise<CryptoKey> => {
  const secretBuffer = string.encodeUtf8(secret).buffer
  const salt = string.encodeUtf8(roomName).buffer
  return crypto.subtle
    .importKey('raw', secretBuffer, 'PBKDF2', false, ['deriveKey'])
    .then((keyMaterial) =>
      crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256',
        },
        keyMaterial,
        {
          name: 'AES-GCM',
          length: 256,
        },
        true,
        ['encrypt', 'decrypt']
      )
    )
}

export const encrypt = (
  data: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> => {
  if (!key) {
    return promise.resolve(data)
  }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  return crypto.subtle
    .encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      data
    )
    .then((cipher) => {
      const encryptedDataEncoder = encoding.createEncoder()
      encoding.writeVarString(encryptedDataEncoder, 'AES-GCM')
      encoding.writeVarUint8Array(encryptedDataEncoder, iv)
      encoding.writeVarUint8Array(encryptedDataEncoder, new Uint8Array(cipher))
      return encoding.toUint8Array(encryptedDataEncoder)
    })
}

export const encryptJson = (
  data: any,
  key: CryptoKey | null
): Promise<Uint8Array> => {
  const dataEncoder = encoding.createEncoder()
  encoding.writeAny(dataEncoder, data)
  return encrypt(encoding.toUint8Array(dataEncoder), key)
}

export const decrypt = (
  data: Uint8Array,
  key: CryptoKey | null
): Promise<Uint8Array> => {
  if (!key) {
    return promise.resolve(data)
  }
  const dataDecoder = decoding.createDecoder(data)
  const algorithm = decoding.readVarString(dataDecoder)
  if (algorithm !== 'AES-GCM') {
    promise.reject(error.create('Unknown encryption algorithm'))
  }
  const iv = decoding.readVarUint8Array(dataDecoder)
  const cipher = decoding.readVarUint8Array(dataDecoder)
  return crypto.subtle
    .decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      cipher
    )
    .then((data) => new Uint8Array(data))
}

export const decryptJson = (
  data: Uint8Array,
  key: CryptoKey | null
): Promise<any> =>
  decrypt(data, key).then((decryptedValue) =>
    decoding.readAny(decoding.createDecoder(new Uint8Array(decryptedValue)))
  )
