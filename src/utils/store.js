'use strict'

function defaultDecodeJid(conn, jid) {
  if (!jid) return jid

  try {
    if (typeof conn.decodeJid === 'function') {
      return conn.decodeJid(jid)
    }
  } catch {}

  return jid
}

function makeInStore(conn, options = {}) {
  if (!conn) {
    throw new TypeError('makeInStore membutuhkan conn')
  }

  const store = {
    chats: {},
    contacts: {},
    messages: {},
    groupMetadata: {},
    presences: {},

    options: {
      decodeJid: true,
      saveMessages: true,
      saveContacts: true,
      saveChats: true,
      saveGroupMetadata: true,
      savePresence: true,
      messageLimit: 100,
      ...options
    },

    _bound: false,
    _listeners: [],

    decodeJid(jid) {
      if (!jid) return jid

      if (!this.options.decodeJid) {
        return jid
      }

      return defaultDecodeJid(conn, jid)
    },

    getChat(jid) {
      jid = this.decodeJid(jid)
      return jid ? this.chats[jid] : undefined
    },

    getContact(jid) {
      jid = this.decodeJid(jid)
      return jid ? this.contacts[jid] : undefined
    },

    getGroupMetadata(jid) {
      jid = this.decodeJid(jid)
      return jid ? this.groupMetadata[jid] : undefined
    },

    getMessages(jid) {
      jid = this.decodeJid(jid)

      if (!jid) return []

      return this.messages[jid] || []
    },

    getAllMessages(jid, limit = 50) {
      jid = this.decodeJid(jid)

      if (!jid) return []

      const messages = this.messages[jid] || []

      return messages.slice(-limit)
    },

    getMessage(jid, id) {
      jid = this.decodeJid(jid)

      if (!jid || !id) {
        return undefined
      }

      const messages = this.messages[jid] || []

      return messages.find(
        message => message?.key?.id === id
      )
    },

    getPresence(jid) {
      jid = this.decodeJid(jid)

      return jid
        ? this.presences[jid]
        : undefined
    },

    setChat(jid, data = {}) {
      jid = this.decodeJid(jid)

      if (
        !jid ||
        jid === 'status@broadcast'
      ) {
        return null
      }

      this.chats[jid] = {
        ...(this.chats[jid] || {}),
        ...data,
        id: jid
      }

      return this.chats[jid]
    },

    setContact(jid, data = {}) {
      jid = this.decodeJid(jid)

      if (
        !jid ||
        jid === 'status@broadcast'
      ) {
        return null
      }

      this.contacts[jid] = {
        ...(this.contacts[jid] || {}),
        ...data,
        id: jid
      }

      return this.contacts[jid]
    },

    setGroupMetadata(jid, metadata) {
      jid = this.decodeJid(jid)

      if (
        !jid ||
        jid === 'status@broadcast'
      ) {
        return null
      }

      if (!metadata) {
        return null
      }

      this.groupMetadata[jid] = metadata

      const chat = this.chats[jid]

      if (chat) {
        chat.metadata = metadata

        if (metadata.subject) {
          chat.subject = metadata.subject
        }
      }

      return metadata
    },

    pushMessage(jid, message) {
      jid = this.decodeJid(jid)

      if (
        !jid ||
        jid === 'status@broadcast' ||
        !message
      ) {
        return
      }

      if (!this.messages[jid]) {
        this.messages[jid] = []
      }

      this.messages[jid].push(message)

      const limit =
        Number(this.options.messageLimit) || 100

      if (
        this.messages[jid].length > limit
      ) {
        this.messages[jid].splice(
          0,
          this.messages[jid].length - limit
        )
      }

      return message
    },

    updateMessages(data) {
      if (
        !this.options.saveMessages ||
        !data?.messages
      ) {
        return
      }

      const messages = Array.isArray(
        data.messages
      )
        ? data.messages
        : [data.messages]

      for (const message of messages) {
        if (!message?.key) {
          continue
        }

        const jid = this.decodeJid(
          message.key.remoteJid
        )

        if (
          !jid ||
          jid === 'status@broadcast'
        ) {
          continue
        }

        this.pushMessage(
          jid,
          message
        )
      }
    },

    setMessage(jid, message) {
      return this.pushMessage(
        jid,
        message
      )
    },

    getMessageById(id) {
      if (!id) return undefined

      for (const jid of Object.keys(
        this.messages
      )) {
        const message =
          this.messages[jid].find(
            item =>
              item?.key?.id === id
          )

        if (message) {
          return message
        }
      }

      return undefined
    },

    getName(jid) {
      jid = this.decodeJid(jid)

      if (!jid) return ''

      const contact =
        this.contacts[jid]

      if (contact) {
        return (
          contact.notify ||
          contact.name ||
          contact.verifiedName ||
          ''
        )
      }

      const chat =
        this.chats[jid]

      if (chat) {
        return (
          chat.name ||
          chat.notify ||
          chat.subject ||
          ''
        )
      }

      return ''
    },

    async updateGroupMetadata(jid) {
      jid = this.decodeJid(jid)

      if (
        !jid ||
        !jid.endsWith('@g.us')
      ) {
        return null
      }

      try {
        const metadata =
          await conn.groupMetadata(jid)

        this.setGroupMetadata(
          jid,
          metadata
        )

        const chat =
          this.chats[jid] ||
          this.setChat(jid)

        chat.isChats = true
        chat.metadata = metadata
        chat.subject =
          metadata?.subject ||
          chat.subject ||
          ''

        return metadata
      } catch {
        return null
      }
    },

    updateContacts(contacts) {
      if (!contacts) return

      contacts =
        contacts.contacts ||
        contacts

      if (!Array.isArray(contacts)) {
        return
      }

      for (const contact of contacts) {
        if (!contact?.id) {
          continue
        }

        const id =
          this.decodeJid(
            contact.id
          )

        if (
          !id ||
          id === 'status@broadcast'
        ) {
          continue
        }

        if (
          this.options.saveContacts
        ) {
          this.setContact(
            id,
            contact
          )
        }

        if (
          this.options.saveChats
        ) {
          const isGroup =
            id.endsWith('@g.us')

          const old =
            this.chats[id] || {}

          this.chats[id] = {
            ...old,
            ...contact,
            id,

            ...(isGroup
              ? {
                  subject:
                    contact.subject ||
                    contact.name ||
                    old.subject ||
                    ''
                }
              : {
                  name:
                    contact.notify ||
                    contact.name ||
                    old.name ||
                    old.notify ||
                    ''
                })
          }
        }
      }
    },

    async updateChats(chats) {
      if (!Array.isArray(chats)) {
        return
      }

      for (const item of chats) {
        if (!item?.id) {
          continue
        }

        const id =
          this.decodeJid(
            item.id
          )

        if (
          !id ||
          id === 'status@broadcast'
        ) {
          continue
        }

        const isGroup =
          id.endsWith('@g.us')

        const chat =
          this.chats[id] || {
            id
          }

        chat.isChats =
          !item.readOnly

        if (item.name) {
          chat[
            isGroup
              ? 'subject'
              : 'name'
          ] = item.name
        }

        if (
          isGroup &&
          this.options.saveGroupMetadata
        ) {
          try {
            const metadata =
              await conn.groupMetadata(
                id
              )

            if (metadata) {
              chat.metadata =
                metadata

              chat.subject =
                item.name ||
                metadata.subject ||
                chat.subject ||
                ''

              this.groupMetadata[id] =
                metadata
            }
          } catch {}
        }

        this.chats[id] = chat
      }
    },

    updateGroupParticipants({
      id,
      participants = [],
      action
    }) {
      id = this.decodeJid(id)

      if (
        !id ||
        id === 'status@broadcast'
      ) {
        return
      }

      let chat =
        this.chats[id]

      if (!chat) {
        chat =
          this.setChat(id)
      }

      chat.isChats = true

      let metadata =
        chat.metadata ||
        this.groupMetadata[id]

      if (!metadata) {
        return
      }

      if (
        !Array.isArray(
          metadata.participants
        )
      ) {
        metadata.participants = []
      }

      switch (action) {
        case 'add':
        case 'revoked_membership_requests': {
          for (
            const participant
            of participants
          ) {
            if (!participant?.id) {
              continue
            }

            const exists =
              metadata.participants.some(
                item =>
                  item.id ===
                  participant.id
              )

            if (!exists) {
              metadata.participants.push(
                participant
              )
            }
          }

          break
        }

        case 'promote':
        case 'demote': {
          for (
            const participant
            of participants
          ) {
            if (!participant?.id) {
              continue
            }

            const target =
              metadata.participants.find(
                item =>
                  item.id ===
                  participant.id
              )

            if (target) {
              target.admin =
                action === 'promote'
                  ? 'admin'
                  : null
            }
          }

          break
        }

        case 'remove': {
          metadata.participants =
            metadata.participants.filter(
              member =>
                !participants.some(
                  removed =>
                    removed?.id ===
                    member.id
                )
            )

          break
        }
      }

      chat.metadata = metadata

      if (
        this.options.saveGroupMetadata
      ) {
        this.groupMetadata[id] =
          metadata
      }
    },

    updateGroups(updates) {
      if (!Array.isArray(updates)) {
        return
      }

      for (const update of updates) {
        if (!update?.id) {
          continue
        }

        const id =
          this.decodeJid(
            update.id
          )

        if (
          !id ||
          id === 'status@broadcast' ||
          !id.endsWith('@g.us')
        ) {
          continue
        }

        const chat =
          this.chats[id] ||
          this.setChat(id)

        chat.isChats = true

        chat.metadata = {
          ...(chat.metadata || {}),
          ...update
        }

        if (
          this.options.saveGroupMetadata
        ) {
          this.groupMetadata[id] =
            chat.metadata
        }

        if (update.subject) {
          chat.subject =
            update.subject
        }
      }
    },

    updatePresence({
      id,
      presences = {}
    }) {
      if (!id) return

      const sender =
        Object.keys(
          presences
        )[0] || id

      const decoded =
        this.decodeJid(sender)

      if (
        !decoded ||
        decoded === 'status@broadcast'
      ) {
        return
      }

      const data =
        presences[sender] || {}

      const presence =
        data.lastKnownPresence ||
        data.presence ||
        'composing'

      if (
        this.options.savePresence
      ) {
        this.setPresence(
          decoded,
          presence
        )
      }

      const chatId =
        this.decodeJid(id)

      if (
        chatId &&
        chatId.endsWith('@g.us')
      ) {
        const chat =
          this.chats[chatId] ||
          this.setChat(chatId)

        chat.isChats = true
      }
    },

    setPresence(jid, presence) {
      jid = this.decodeJid(jid)

      if (
        !jid ||
        jid === 'status@broadcast'
      ) {
        return
      }

      this.presences[jid] =
        presence

      const chat =
        this.chats[jid]

      if (chat) {
        chat.presences =
          presence
      }

      return presence
    },

    bind() {
      if (this._bound) {
        return this
      }

      if (!conn.ev?.on) {
        throw new TypeError(
          'conn.ev.on tidak tersedia'
        )
      }

      const on = (
        event,
        handler
      ) => {
        conn.ev.on(
          event,
          handler
        )

        this._listeners.push({
          event,
          handler
        })
      }

      on(
        'messages.upsert',
        data => {
          try {
            this.updateMessages(
              data
            )
          } catch (error) {
            console.error(
              '[store] messages.upsert:',
              error
            )
          }
        }
      )

      on(
        'contacts.upsert',
        contacts => {
          try {
            this.updateContacts(
              contacts
            )
          } catch (error) {
            console.error(
              '[store] contacts.upsert:',
              error
            )
          }
        }
      )

      on(
        'contacts.set',
        contacts => {
          try {
            this.updateContacts(
              contacts
            )
          } catch (error) {
            console.error(
              '[store] contacts.set:',
              error
            )
          }
        }
      )

      on(
        'chats.set',
        async data => {
          try {
            await this.updateChats(
              data?.chats || []
            )
          } catch (error) {
            console.error(
              '[store] chats.set:',
              error
            )
          }
        }
      )

      on(
        'chats.upsert',
        chats => {
          try {
            const list =
              Array.isArray(chats)
                ? chats
                : [chats]

            for (
              const item
              of list
            ) {
              if (!item?.id) {
                continue
              }

              const id =
                this.decodeJid(
                  item.id
                )

              if (
                !id ||
                id === 'status@broadcast'
              ) {
                continue
              }

              this.chats[id] = {
                ...(this.chats[id] || {}),
                ...item,
                id,
                isChats: true
              }
            }
          } catch (error) {
            console.error(
              '[store] chats.upsert:',
              error
            )
          }
        }
      )

      on(
        'groups.update',
        updates => {
          try {
            this.updateContacts(
              updates
            )

            this.updateGroups(
              updates
            )
          } catch (error) {
            console.error(
              '[store] groups.update:',
              error
            )
          }
        }
      )

      on(
        'group-participants.update',
        async data => {
          try {
            const id =
              this.decodeJid(
                data?.id
              )

            if (!id) return

            if (
              !this.chats[id]?.metadata &&
              !this.groupMetadata[id]
            ) {
              await this.updateGroupMetadata(
                id
              )
            }

            this.updateGroupParticipants({
              ...data,
              id
            })
          } catch (error) {
            console.error(
              '[store] group-participants.update:',
              error
            )
          }
        }
      )

      on(
        'presence.update',
        data => {
          try {
            this.updatePresence(
              data
            )
          } catch (error) {
            console.error(
              '[store] presence.update:',
              error
            )
          }
        }
      )

      this._bound = true

      return this
    },

    unbind() {
      if (!this._bound) {
        return this
      }

      if (
        typeof conn.ev?.off ===
        'function'
      ) {
        for (
          const {
            event,
            handler
          } of this._listeners
        ) {
          conn.ev.off(
            event,
            handler
          )
        }
      }

      this._listeners = []
      this._bound = false

      return this
    },

    clearMessages(jid) {
      if (jid) {
        jid = this.decodeJid(jid)

        if (jid) {
          delete this.messages[jid]
        }
      } else {
        this.messages = {}
      }

      return this
    },

    clear() {
      this.chats = {}
      this.contacts = {}
      this.messages = {}
      this.groupMetadata = {}
      this.presences = {}

      return this
    }
  }

  return store
}

export {
  makeInStore
}

export default makeInStore