import path from "path";
import { toAudio } from "./ffmpeg.js";
import fs from "fs";
import { fileTypeFromBuffer } from "file-type";

import { makeWASocket as _makeWaSocket, proto, downloadContentFromMessage, jidDecode, areJidsSameUser, generateForwardMessageContent, generateWAMessageFromContent, WAMessageStubType, extractMessageContent } from "@whiskeysockets/baileys";

export function makeWASocket(connectionOptions, options = {}) {
  const client = _makeWaSocket(connectionOptions);

  const sock = Object.defineProperties(client, {
    chats: {
      value: { ...(options.chats || {}) },
      writable: true,
    },
    decodeJid: {
      value(jid) {
        if (!jid || typeof jid !== "string") return (!nullish(jid) && jid) || null;
        return decodeJid(jid);
      },
    },
    getFile: {
      async value(PATH, saveToFile = false) {
        let res, filename;
        const data = Buffer.isBuffer(PATH) ? PATH : PATH instanceof ArrayBuffer ? Buffer.from(new Uint8Array(PATH)) : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split(",")[1], "base64") : /^https?:\/\//.test(PATH) ? Buffer.from(await (res = await fetch(PATH)).arrayBuffer()) : fs.existsSync(PATH) ? ((filename = PATH), fs.readFileSync(PATH)) : typeof PATH === "string" ? PATH : Buffer.alloc(0);
        if (!Buffer.isBuffer(data)) throw new TypeError("Result is not a buffer");
        const type = (await fileTypeFromBuffer(data)) || {
          mime: "application/octet-stream",
          ext: ".bin",
        };
        if (data && saveToFile && !filename) ((filename = path.join(import.meta.dirname, `../tmp/${Date.now()}.${type.ext}`)), await fs.promises.writeFile(filename, data));
        return {
          res,
          filename,
          ...type,
          data,
          deleteFile() {
            return filename && fs.promises.unlink(filename);
          },
        };
      },
      enumerable: true,
    },
    relayWAMessage: {
      async value(pesanfull) {
        if (pesanfull.message.audioMessage) {
          await client.sendPresenceUpdate("recording", pesanfull.key.remoteJid);
        } else {
          await client.sendPresenceUpdate("composing", pesanfull.key.remoteJid);
        }
        const mekirim = await client.relayMessage(pesanfull.key.remoteJid, pesanfull.message, { messageId: pesanfull.key.id });
        client.ev.emit("messages.upsert", { messages: [pesanfull], type: "append" });
        return mekirim;
      },
    },
    sendFile: {
      async value(jid, path, filename = "", caption = "", quoted, ptt = false, options = {}) {
        const type = await client.getFile(path, true);
        const { res } = type;
        let { data: file, filename: pathFile } = type;
        if ((res && res.status !== 200) || file.length <= 65536) {
          try {
            throw { json: JSON.parse(file.toString()) };
          } catch (e) {
            if (e.json) throw e.json;
          }
        }
        const opt = {};
        if (quoted) opt.quoted = quoted;
        opt.ephemeralExpiration = 86400;
        opt.disappearingMessagesInChat = 86400;
        if (!type) options.asDocument = true;
        let mtype,
          mimetype = options.mimetype || type.mime,
          convert;
        if (/webp/.test(type.mime) || (/image/.test(type.mime) && options.asSticker)) mtype = "sticker";
        else if (/image/.test(type.mime) || (/webp/.test(type.mime) && options.asImage)) mtype = "image";
        else if (/video/.test(type.mime)) mtype = "video";
        else if (/audio/.test(type.mime)) ((convert = await toAudio(file, type.ext)), (file = convert.data), (pathFile = convert.filename), (mtype = "audio"), (mimetype = options.mimetype || "audio/ogg; codecs=opus"));
        else mtype = "document";
        if (options.asDocument) mtype = "document";

        delete options.asSticker;
        delete options.asLocation;
        delete options.asVideo;
        delete options.asDocument;
        delete options.asImage;

        const textMentions = caption ? await client.parseMention(caption) : [];
        const extraMentions = options?.mentions || [];
        const mentionedJid = [...textMentions, ...extraMentions];

        const contextInfo = { mentionedJid };
        // Etiqueta "reenviado desde el canal" (sección [canal] de config.toml; main.js resuelve el ID al conectarse).
        if (globalThis.canal?.jid) {
          contextInfo.isForwarded = true;
          contextInfo.forwardingScore = 1;
          contextInfo.forwardedNewsletterMessageInfo = {
            newsletterJid: globalThis.canal.jid,
            newsletterName: globalThis.canal.nombre,
            serverMessageId: "",
          };
        }
        // Tarjeta con el link del grupo (sección [tarjetaGrupo]). Va como "externalAdReply": título, texto y link tocable.
        if (globalThis.tarjetaGrupo?.enlace) {
          contextInfo.externalAdReply = {
            title: globalThis.tarjetaGrupo.titulo || "",
            body: globalThis.tarjetaGrupo.cuerpo || "",
            sourceUrl: globalThis.tarjetaGrupo.enlace,
            mediaType: 1,
            renderLargerThumbnail: false,
            showAdAttribution: false,
          };
        }

        const message = {
          ...options,
          caption,
          ptt,
          [mtype]: { url: pathFile },
          mimetype,
          fileName: filename || pathFile.split("/").pop(),
          contextInfo,
        };

        let m;
        try {
          m = await client.sendMessage(jid, message, { ...opt, ...options });
        } catch (e) {
          console.error(e);
          m = null;
        }
        // Si mandar por ruta falló, se manda el buffer directo.
        if (!m) m = await client.sendMessage(jid, { ...message, [mtype]: file }, { ...opt, ...options });
        return m;
      },
      enumerable: true,
    },
    sendText: {
      async value(jid, text = "", quoted, options = {}) {
        const textMentions = await client.parseMention(text);
        const extraMentions = options?.mentions || [];
        const mentionedJid = [...textMentions, ...extraMentions];

        const contextInfo = { mentionedJid };

        const opt = {};
        if (quoted) opt.quoted = quoted;
        opt.ephemeralExpiration = 86400;
        opt.disappearingMessagesInChat = 86400;

        const messageOptions = {
          ...options,
          text,
          contextInfo,
        };

        return client.sendMessage(jid, messageOptions, { ...opt, ...options });
      },
    },
    cMod: {
      value(jid, message, text = "", sender = client.user.jid, options = {}) {
        if (options.mentions && !Array.isArray(options.mentions)) options.mentions = [options.mentions];
        const copy = message.toJSON();
        delete copy.message.messageContextInfo;
        delete copy.message.senderKeyDistributionMessage;
        const mtype = Object.keys(copy.message)[0];
        const msg = copy.message;
        const content = msg[mtype];
        if (typeof content === "string") msg[mtype] = text || content;
        else if (content.caption) content.caption = text || content.caption;
        else if (content.text) content.text = text || content.text;
        if (typeof content !== "string") {
          msg[mtype] = { ...content, ...options };
          msg[mtype].contextInfo = {
            ...(content.contextInfo || {}),
            mentionedJid: options.mentions || content.contextInfo?.mentionedJid || [],
          };
        }
        if (copy.participant) sender = copy.participant = sender || copy.participant;
        else if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant;
        if (copy.key.remoteJid.includes("@s.whatsapp.net")) sender = sender || copy.key.remoteJid;
        else if (copy.key.remoteJid.includes("@broadcast")) sender = sender || copy.key.remoteJid;
        copy.key.remoteJid = jid;
        copy.key.fromMe = areJidsSameUser(sender, client.user.id) || false;
        return proto.WebMessageInfo.fromObject(copy);
      },
      enumerable: true,
    },
    copyNForward: {
      async value(jid, message, forwardingScore = true, options = {}) {
        let vtype;
        if (options.readViewOnce && message.message.viewOnceMessage?.message) {
          vtype = Object.keys(message.message.viewOnceMessage.message)[0];
          delete message.message.viewOnceMessage.message[vtype].viewOnce;
          message.message = proto.Message.fromObject(JSON.parse(JSON.stringify(message.message.viewOnceMessage.message)));
          message.message[vtype].contextInfo = message.message.viewOnceMessage.contextInfo;
        }
        const mtype = Object.keys(message.message)[0];
        let m = generateForwardMessageContent(message, !!forwardingScore);
        const ctype = Object.keys(m)[0];
        if (forwardingScore && typeof forwardingScore === "number" && forwardingScore > 1) m[ctype].contextInfo.forwardingScore += forwardingScore;
        m[ctype].contextInfo = {
          ...(message.message[mtype].contextInfo || {}),
          ...(m[ctype].contextInfo || {}),
        };
        m = generateWAMessageFromContent(jid, m, {
          ...options,
          userJid: client.user.jid,
        });
        await client.relayMessage(jid, m.message, { messageId: m.key.id, additionalAttributes: { ...options } });
        return m;
      },
      enumerable: true,
    },
    downloadM: {
      async value(m, type, saveToFile) {
        let filename;
        if (!m || !(m.url || m.directPath)) return Buffer.alloc(0);
        const stream = await downloadContentFromMessage(m, type);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }
        if (saveToFile) ({ filename } = await client.getFile(buffer, true));
        return saveToFile && fs.existsSync(filename) ? filename : buffer;
      },
      enumerable: true,
    },
    parseMention: {
      value(text = "") {
        return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map((v) => (v[1] === "0" ? "0@s.whatsapp.net" : `${v[1]}@lid`));
      },
      enumerable: true,
    },
    getName: {
      value(jid = "", withoutContact = false) {
        jid = client.decodeJid(jid);
        withoutContact = client.withoutContact || withoutContact;
        let v;
        if (jid?.endsWith("@g.us"))
          return (async () => {
            v = client.chats[jid] || {};
            if (!(v.name || v.subject)) v = (await client.groupMetadata(jid)) || {};
            return v.name || v.subject || jid;
          })();
        else
          v =
            jid === "0@s.whatsapp.net"
              ? {
                  jid,
                  vname: "WhatsApp",
                }
              : areJidsSameUser(jid, client.user.id)
                ? client.user
                : client.chats[jid] || {};
        return (withoutContact ? "" : v.name) || v.subject || v.vname || v.notify || v.verifiedName;
      },
      enumerable: true,
    },
    loadMessage: {
      value(messageID) {
        return Object.entries(client.chats)
          .filter(([_, { messages }]) => typeof messages === "object")
          .find(([_, { messages }]) => Object.entries(messages).find(([k, v]) => k === messageID || v.key?.id === messageID))?.[1].messages?.[messageID];
      },
      enumerable: true,
    },
    processMessageStubType: {
      async value(m) {
        if (!m.messageStubType) return;
        const chat = client.decodeJid(m.key.remoteJid || m.message?.senderKeyDistributionMessage?.groupId || "");
        if (!chat || chat === "status@broadcast") return;
        const emitGroupUpdate = (update) => {
          client.ev.emit("groups.update", [{ id: chat, ...update }]);
        };
        switch (m.messageStubType) {
          case WAMessageStubType.REVOKE:
          case WAMessageStubType.GROUP_CHANGE_INVITE_LINK:
            emitGroupUpdate({ revoke: m.messageStubParameters?.[0] });
            break;
          case WAMessageStubType.GROUP_CHANGE_ICON:
            emitGroupUpdate({ icon: m.messageStubParameters?.[0] });
            break;
          default: {
            break;
          }
        }
        const isGroup = chat.endsWith("@g.us");
        if (!isGroup) return;
        let chats = client.chats[chat];
        if (!chats) chats = client.chats[chat] = { id: chat };
        chats.isChats = true;
        const metadata = await client.groupMetadata(chat).catch((_) => null);
        if (!metadata) return;
        chats.subject = metadata.subject;
        chats.metadata = metadata;
      },
    },
    insertAllGroup: {
      async value() {
        const groups = (await client.groupFetchAllParticipating().catch((_) => null)) || {};
        for (const group in groups) client.chats[group] = { ...(client.chats[group] || {}), id: group, subject: groups[group].subject, isChats: true, metadata: groups[group] };
        return client.chats;
      },
    },
    pushMessage: {
      async value(m) {
        if (!m) return;
        const message = m;
        try {
          if (!message) return;
          if (message.messageStubType && Number(message.messageStubType) !== WAMessageStubType.CIPHERTEXT) client.processMessageStubType(message).catch(console.error);
          const _mtype = Object.keys(message.message || {});
          const mtype = (!["senderKeyDistributionMessage", "messageContextInfo"].includes(_mtype[0]) && _mtype[0]) || (_mtype.length >= 3 && _mtype[1] !== "messageContextInfo" && _mtype[1]) || _mtype[_mtype.length - 1];
          const chat = client.decodeJid(message.key.remoteJid || message.message?.senderKeyDistributionMessage?.groupId || "");
          if (message.message?.[mtype]?.contextInfo?.quotedMessage) {
            const context = message.message[mtype].contextInfo;
            let participant = client.decodeJid(context.participant);
            const remoteJid = client.decodeJid(context.remoteJid || participant);
            const quoted = message.message[mtype].contextInfo.quotedMessage;
            if (remoteJid && remoteJid !== "status@broadcast" && quoted) {
              let qMtype = Object.keys(quoted)[0];
              if (qMtype === "conversation") {
                quoted.extendedTextMessage = { text: quoted[qMtype] };
                delete quoted.conversation;
                qMtype = "extendedTextMessage";
              }
              if (!quoted[qMtype].contextInfo) quoted[qMtype].contextInfo = {};
              quoted[qMtype].contextInfo.mentionedJid = context.mentionedJid || quoted[qMtype].contextInfo.mentionedJid || [];
              const isGroup = remoteJid.endsWith("g.us");
              if (isGroup && !participant) participant = remoteJid;
              const qM = {
                key: {
                  remoteJid,
                  fromMe: areJidsSameUser(client.user.jid, remoteJid),
                  id: context.stanzaId,
                  participant,
                },
                message: JSON.parse(JSON.stringify(quoted)),
                ...(isGroup ? { participant } : {}),
              };
              let qChats = client.chats[participant];
              if (!qChats) qChats = client.chats[participant] = { id: participant, isChats: !isGroup };
              if (!qChats.messages) qChats.messages = {};
              if (!qChats.messages[context.stanzaId] && !qM.key.fromMe) qChats.messages[context.stanzaId] = qM;
              let qChatsMessages;
              if ((qChatsMessages = Object.entries(qChats.messages)).length > 40) qChats.messages = Object.fromEntries(qChatsMessages.slice(30, qChatsMessages.length));
            }
          }
          if (!chat || chat === "status@broadcast") return;
          const isGroup = chat.endsWith("@g.us");
          let chats = client.chats[chat];
          if (!chats) {
            if (isGroup) await client.insertAllGroup().catch(console.error);
            chats = client.chats[chat] = { id: chat, isChats: true, ...(client.chats[chat] || {}) };
          }
          let metadata, sender;
          if (isGroup) {
            if (!chats.subject || !chats.metadata) {
              metadata = (await client.groupMetadata(chat).catch((_) => ({}))) || {};
              if (!chats.subject) chats.subject = metadata.subject || "";
              if (!chats.metadata) chats.metadata = metadata;
            }
            sender = client.decodeJid((message.key?.fromMe && client.user.id) || message.participant || message.key?.participant || chat || "");
            if (sender !== chat) {
              let chats = client.chats[sender];
              if (!chats) chats = client.chats[sender] = { id: sender };
              if (!chats.name) chats.name = message.pushName || chats.name || "";
            }
          } else if (!chats.name) chats.name = message.pushName || chats.name || "";
          if (["senderKeyDistributionMessage", "messageContextInfo"].includes(mtype)) return;
          chats.isChats = true;
          if (!chats.messages) chats.messages = {};
          const fromMe = message.key.fromMe || areJidsSameUser(sender || chat, client.user.id);
          if (!["protocolMessage"].includes(mtype) && !fromMe && Number(message.messageStubType) !== WAMessageStubType.CIPHERTEXT && message.message) {
            delete message.message.messageContextInfo;
            delete message.message.senderKeyDistributionMessage;
            chats.messages[message.key.id] = JSON.parse(JSON.stringify(message, null, 2));
            let chatsMessages;
            if ((chatsMessages = Object.entries(chats.messages)).length > 40) chats.messages = Object.fromEntries(chatsMessages.slice(30, chatsMessages.length));
          }
        } catch (e) {
          console.error(e);
        }
      },
    },
    serializeM: {
      value(m) {
        return smsg(client, m);
      },
    },
  });
  function bind(client) {
    if (!client.chats) client.chats = {};
  }

  if (sock.user?.id) sock.user.jid = cleanId(sock?.user?.id);
  if (sock.user?.lid) sock.user.lid = cleanId(sock?.user?.lid);
  bind(sock);
  return sock;
}

export function smsg(client, m) {
  if (!m) return m;
  const M = proto.WebMessageInfo;
  m = M.create(m);
  m.client = client;
  let protocolMessageKey;
  if (m.message) {
    if (m.mtype === "protocolMessage" && m.msg.key) {
      protocolMessageKey = m.msg.key;
      if (!protocolMessageKey.participant || protocolMessageKey.participant === "status_me") protocolMessageKey.participant = m.sender;
      protocolMessageKey.fromMe = client.decodeJid(protocolMessageKey.participant) === client.decodeJid(client.user.id);
      if (!protocolMessageKey.fromMe && protocolMessageKey.remoteJid === client.decodeJid(client.user.id)) protocolMessageKey.remoteJid = m.sender;
    }
    if (m.quoted) if (!m.quoted.mediaMessage) delete m.quoted.download;
  }
  if (!m.mediaMessage) delete m.download;
  try {
    if (protocolMessageKey && m.mtype === "protocolMessage") client.ev.emit("message.delete", protocolMessageKey);
  } catch (e) {
    console.error(e);
  }
  return m;
}

export function serialize() {
  const MediaType = ["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"];
  return Object.defineProperties(proto.WebMessageInfo.prototype, {
    client: {
      value: undefined,
      enumerable: false,
      writable: true,
    },
    id: {
      get() {
        return this.key?.id;
      },
    },
    isBaileys: {
      get() {
        return ((this?.fromMe || areJidsSameUser(this.client?.user.id, this.sender)) && this.id.startsWith("3EB0") && (this.id.length === 20 || this.id.length === 22 || this.id.length === 12)) || false;
      },
    },
    chat: {
      get() {
        const keys = [this.key?.remoteJid, this.key?.remoteJidAlt, this.key?.participant, this.key?.participantAlt].filter(Boolean);

        // 1. Prioridad: grupos
        const group = keys.find((j) => j.endsWith("@g.us"));
        if (group) return group;

        // 2. Prioridad: status
        const status = keys.find((j) => j === "status@broadcast");
        if (status) return status;

        // 3. NUEVA PRIORIDAD: LIDs antes que usuarios normales
        const lid = keys.find((j) => j.endsWith("@lid"));
        if (lid) return lid;

        // 4. Ahora sí usuarios normales (@s.whatsapp.net) al final
        const user = keys.find((j) => j.endsWith("@s.whatsapp.net"));
        if (user) return user;

        // Si no encuentra nada, devuelve string vacío
        return "";
      },
      enumerable: true,
    },
    isGroup: {
      get() {
        return this.chat.endsWith("@g.us");
      },
      enumerable: true,
    },
    sender: {
      get() {
        const cleanBotJid = cleanId(this.client.user.id);
        const cleanBotLid = cleanId(this.client.user.lid);
        const keys = [this.key?.remoteJid, this.key?.remoteJidAlt, this.key?.participant, this.key?.participantAlt].filter(Boolean);
        const isFromMe = this.key?.fromMe || keys.some((k) => k === cleanBotJid || k === cleanBotLid);

        // Si es fromMe retornar el lid limpio del usuario
        if (isFromMe) {
          return cleanBotLid;
        }

        // 1. Prioridad: usuarios LID
        const lid = keys.find((j) => j.endsWith("@lid"));
        if (lid) return lid;

        // 2. Prioridad: usuarios jids
        const jid = keys.find((j) => j.endsWith("@s.whatsapp.net"));
        if (jid) return jid;

        return "";
      },
      enumerable: true,
    },
    senderJid: {
      get() {
        const cleanBotJid = cleanId(this.client.user.id);
        const cleanBotLid = cleanId(this.client.user.lid);
        const keys = [this.key?.remoteJid, this.key?.remoteJidAlt, this.key?.participant, this.key?.participantAlt].filter(Boolean);
        const isFromMe = this.key?.fromMe || keys.some((k) => k === cleanBotJid || k === cleanBotLid);

        if (isFromMe) {
          return cleanBotJid;
        }

        const jid = keys.find((j) => j.endsWith("@s.whatsapp.net"));
        return jid || "";
      },
      enumerable: true,
    },
    fromMe: {
      get() {
        const cleanBotJid = cleanId(this.client.user.id);
        const cleanBotLid = cleanId(this.client.user.lid);
        return this.key?.fromMe || this.sender === cleanBotJid || this.sender === cleanBotLid || false;
      },
    },
    mtype: {
      get() {
        if (!this.message) return "";
        const type = Object.keys(this.message);
        return (!["senderKeyDistributionMessage", "messageContextInfo"].includes(type[0]) && type[0]) || (type.length >= 3 && type[1] !== "messageContextInfo" && type[1]) || type[type.length - 1];
      },
      enumerable: true,
    },
    msg: {
      get() {
        if (!this.message) return null;
        return this.message[this.mtype];
      },
    },
    mediaMessage: {
      get() {
        if (!this.message) return null;
        const Message = (this.msg?.url || this.msg?.directPath ? { ...this.message } : extractMessageContent(this.message)) || null;
        if (!Message) return null;
        const mtype = Object.keys(Message)[0];
        return MediaType.includes(mtype) ? Message : null;
      },
      enumerable: true,
    },
    mediaType: {
      get() {
        let message;
        if (!(message = this.mediaMessage)) return null;
        return Object.keys(message)[0];
      },
      enumerable: true,
    },
    quoted: {
      get() {
        const self = this;
        const msg = self.msg;
        const contextInfo = msg?.contextInfo;
        const quoted = contextInfo?.quotedMessage;
        if (!msg || !contextInfo || !quoted) return null;
        const type = Object.keys(quoted)[0];
        const q = quoted[type];
        const text = typeof q === "string" ? q : q.text;
        return Object.defineProperties(JSON.parse(JSON.stringify(typeof q === "string" ? { text: q } : q)), {
          mtype: {
            get() {
              return type;
            },
            enumerable: true,
          },
          mediaMessage: {
            get() {
              const Message = (q.url || q.directPath ? { ...quoted } : extractMessageContent(quoted)) || null;
              if (!Message) return null;
              const mtype = Object.keys(Message)[0];
              return MediaType.includes(mtype) ? Message : null;
            },
            enumerable: true,
          },
          mediaType: {
            get() {
              let message;
              if (!(message = this.mediaMessage)) return null;
              return Object.keys(message)[0];
            },
            enumerable: true,
          },
          id: {
            get() {
              return contextInfo.stanzaId;
            },
            enumerable: true,
          },
          chat: {
            get() {
              return contextInfo.remoteJid || self.chat;
            },
            enumerable: true,
          },
          isBaileys: {
            get() {
              return ((this?.fromMe || areJidsSameUser(this.client?.user.id, this.sender)) && this.id.startsWith("3EB0") && (this.id.length === 20 || this.id.length === 22 || this.id.length === 12)) || false;
            },
            enumerable: true,
          },
          sender: {
            get() {
              return decodeJid(contextInfo.participant || this.chat || "");
            },
            enumerable: true,
          },
          fromMe: {
            get() {
              const cleanBotJid = cleanId(self.client.user.id);
              const cleanBotLid = cleanId(self.client.user.lid);
              return this.sender === cleanBotJid || this.sender === cleanBotLid || false;
            },
            enumerable: true,
          },
          text: {
            get() {
              return text || this.caption || this.contentText || this.selectedDisplayText || "";
            },
            enumerable: true,
          },
          name: {
            get() {
              const sender = this.sender;
              return sender ? self.client?.getName(sender) : null;
            },
            enumerable: true,
          },
          vM: {
            get() {
              return proto.WebMessageInfo.fromObject({
                key: {
                  fromMe: this.fromMe,
                  remoteJid: this.chat,
                  id: this.id,
                },
                message: quoted,
                ...(self.isGroup ? { participant: this.sender } : {}),
              });
            },
          },
          fakeObj: {
            get() {
              return this.vM;
            },
          },
          download: {
            value(saveToFile = false) {
              const mtype = this.mediaType;
              return self.client?.downloadM(this.mediaMessage[mtype], mtype.replace(/message/i, ""), saveToFile);
            },
            enumerable: true,
            configurable: true,
          },
          sendText: {
            value(text, chatId, options) {
              return self.client?.sendText(chatId ? chatId : this.chat, text, this.vM, options);
            },
            enumerable: true,
          },
          copy: {
            value() {
              const M = proto.WebMessageInfo;
              return smsg(client, M.fromObject(M.toObject(this.vM)));
            },
            enumerable: true,
          },
          forward: {
            value(jid, force = false, options) {
              return self.client?.sendMessage(
                jid,
                {
                  forward: this.vM,
                  force,
                  ...options,
                },
                { ...options },
              );
            },
            enumerable: true,
          },
          copyNForward: {
            value(jid, forceForward = false, options) {
              return self.client?.copyNForward(jid, this.vM, forceForward, options);
            },
            enumerable: true,
          },
          cMod: {
            value(jid, text = "", sender = this.sender, options = {}) {
              return self.client?.cMod(jid, this.vM, text, sender, options);
            },
            enumerable: true,
          },
          delete: {
            value() {
              return self.client?.sendMessage(this.chat, { delete: { remoteJid: this.vM.key.remoteJid, fromMe: false, id: contextInfo?.stanzaId, participant: contextInfo?.participant } });
            },
            enumerable: true,
          },
          react: {
            value(text) {
              return self.client?.sendMessage(this.chat, { react: { text, key: this.vM.key } });
            },
            enumerable: true,
          },
        });
      },
      enumerable: true,
    },
    _text: {
      value: null,
      writable: true,
    },
    text: {
      get() {
        const msg = this.msg;
        const text = (typeof msg === "string" ? msg : msg?.text) || msg?.caption || msg?.selectedButtonId || msg?.selectedId || ""; // Penúltimo es de botones
        return typeof text === "string" ? text : "";
      },
      set(str) {
        this._text = str;
      },
      enumerable: true,
    },
    mentionedJid: {
      get() {
        return (this.msg?.contextInfo?.mentionedJid?.length && this.msg.contextInfo.mentionedJid) || [];
      },
      enumerable: true,
    },
    name: {
      get() {
        return (!nullish(this.pushName) && this.pushName) || this.client?.getName(this.sender);
      },
      enumerable: true,
    },
    download: {
      value(saveToFile = false) {
        const mtype = this.mediaType;
        const mediaMessage = this.mediaMessage;
        if (!mediaMessage) return null;
        return this.client?.downloadM(mediaMessage[mtype], mtype.replace(/message/i, ""), saveToFile);
      },
      enumerable: true,
      configurable: true,
    },
    sendText: {
      value(text, chatId, options) {
        return this.client?.sendText(chatId ? chatId : this.chat, text, this, options);
      },
    },
    copy: {
      value() {
        const M = proto.WebMessageInfo;
        return smsg(this.client, M.fromObject(M.toObject(this)));
      },
      enumerable: true,
    },
    forward: {
      value(jid, force = false, options = {}) {
        return this.client?.sendMessage(
          jid,
          {
            forward: this,
            force,
            ...options,
          },
          { ...options },
        );
      },
      enumerable: true,
    },
    copyNForward: {
      value(jid, forceForward = false, options = {}) {
        return this.client?.copyNForward(jid, this, forceForward, options);
      },
      enumerable: true,
    },
    cMod: {
      value(jid, text = "", sender = this.sender, options = {}) {
        return this.client?.cMod(jid, this, text, sender, options);
      },
      enumerable: true,
    },
    delete: {
      value() {
        return this.client?.sendMessage(this.chat, { delete: this.key });
      },
      enumerable: true,
    },
    react: {
      value(text) {
        return this.client?.sendMessage(this.chat, {
          react: {
            text,
            key: this.key,
          },
        });
      },
      enumerable: true,
    },
  });
}

// "123:4@lid" → "123@lid": saca el sufijo de dispositivo del jid. Es lo que usan client.decodeJid y m.sender.
function decodeJid(jid) {
  if (!/:\d+@/i.test(jid)) return jid.trim();
  const decode = jidDecode(jid) || {};
  return ((decode.user && decode.server && `${decode.user}@${decode.server}`) || jid).trim();
}

function nullish(args) {
  return !(args !== null && args !== undefined);
}

function cleanId(id) {
  if (/:\d+@/gi.test(id)) {
    const parts = id.split(":");
    return `${parts[0]}@${id.split("@")[1]}`.trim();
  }
  return id?.trim();
}
