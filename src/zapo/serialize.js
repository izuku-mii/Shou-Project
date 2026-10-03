// Event 'message' dari zapo → objek mirip WAMessage Baileys
// ({ key, message, pushName, messageTimestamp }) supaya procMsg() lama bisa dipakai.
// Event aslinya tetap di-spread, jadi objek ini juga valid dipakai sebagai `quote`
// untuk client.message.send().
export function toWAMessage(event) {
  return {
    ...event,
    key: event.key,
    message: event.message || {},
    pushName: event.pushName,
    messageTimestamp: event.timestampSeconds || Math.floor(Date.now() / 1000)
  }
}
