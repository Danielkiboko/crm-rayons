import net from 'node:net';

// Constantes de commandes SMPP v3.4
const CMD = {
  BIND_TRANSCEIVER: 0x00000009,
  BIND_TRANSCEIVER_RESP: 0x80000009,
  SUBMIT_SM: 0x00000004,
  SUBMIT_SM_RESP: 0x80000004,
  UNBIND: 0x00000006,
  UNBIND_RESP: 0x80000006,
  ENQUIRE_LINK: 0x00000015,
  ENQUIRE_LINK_RESP: 0x80000015
};

function cstr(str = '') {
  return Buffer.concat([Buffer.from(String(str), 'ascii'), Buffer.from([0x00])]);
}

function buildPdu(commandId, bodyBuffer, seq = 1, status = 0) {
  const length = 16 + bodyBuffer.length;
  const header = Buffer.alloc(16);
  header.writeUInt32BE(length, 0);
  header.writeUInt32BE(commandId, 4);
  header.writeUInt32BE(status, 8);
  header.writeUInt32BE(seq, 12);
  return Buffer.concat([header, bodyBuffer]);
}

function buildBindTransceiverPdu({ systemId = '', password = '', systemType = '' }, seq = 1) {
  const body = Buffer.concat([
    cstr(systemId),
    cstr(password),
    cstr(systemType),
    Buffer.from([0x34]), // interface_version = SMPP v3.4 (0x34)
    Buffer.from([0x00]), // addr_ton
    Buffer.from([0x00]), // addr_npi
    cstr('') // address_range
  ]);
  return buildPdu(CMD.BIND_TRANSCEIVER, body, seq);
}

function buildSubmitSmPdu({ senderId = 'RAYONS', to = '', text = '', ton = 5, npi = 0 }, seq = 2) {
  const cleanDest = String(to).replace(/\D/g, '');
  const msgBuf = Buffer.from(String(text), 'utf8');
  const body = Buffer.concat([
    cstr(''), // service_type
    Buffer.from([Number(ton) || 5]), // source_addr_ton (5 = Alphanumeric)
    Buffer.from([Number(npi) || 0]), // source_addr_npi
    cstr(String(senderId).slice(0, 11)), // source_addr
    Buffer.from([0x01]), // dest_addr_ton (1 = International)
    Buffer.from([0x01]), // dest_addr_npi (1 = ISDN/E.164)
    cstr(cleanDest), // destination_addr
    Buffer.from([0x00]), // esm_class
    Buffer.from([0x00]), // protocol_id
    Buffer.from([0x00]), // priority_flag
    cstr(''), // schedule_delivery_time
    cstr(''), // validity_period
    Buffer.from([0x01]), // registered_delivery = 1 (Demander DLR opérateur)
    Buffer.from([0x00]), // replace_if_present_flag
    Buffer.from([0x08]), // data_coding = 0x08 (UCS2/UTF-8)
    Buffer.from([0x00]), // sm_default_msg_id
    Buffer.from([msgBuf.length]), // sm_length
    msgBuf
  ]);
  return buildPdu(CMD.SUBMIT_SM, body, seq);
}

/**
 * Teste une connexion SMPP v3.4 (TCP + bind_transceiver) ou envoie un SMS via submit_sm
 */
export function executeSmppSession(config, smsPayload = null, timeoutMs = 6000) {
  const host = config.smppHost || '';
  const port = Number(config.smppPort || 2775);
  const start = Date.now();

  return new Promise((resolve, reject) => {
    if (!host) {
      return reject(new Error('Hôte SMPP (smppHost) non configuré'));
    }

    const socket = new net.Socket();
    let settled = false;
    let buffer = Buffer.alloc(0);

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      if (err) reject(err);
      else resolve(result);
    };

    socket.setTimeout(timeoutMs, () => {
      finish(new Error(`Délai d'attente SMPP dépassé (${timeoutMs} ms) vers ${host}:${port}`));
    });

    socket.on('error', err => {
      finish(new Error(`Erreur réseau SMPP (${host}:${port}) : ${err.message}`));
    });

    socket.connect(port, host, () => {
      // Dès la connexion TCP établie, envoyer bind_transceiver
      const bindPdu = buildBindTransceiverPdu(
        {
          systemId: config.systemId || '',
          password: config.smppPassword || '',
          systemType: config.systemType || 'SMPP'
        },
        1
      );
      socket.write(bindPdu);
    });

    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 16) {
        const pduLen = buffer.readUInt32BE(0);
        if (buffer.length < pduLen) break;

        const pdu = buffer.subarray(0, pduLen);
        buffer = buffer.subarray(pduLen);

        const cmdId = pdu.readUInt32BE(4);
        const cmdStatus = pdu.readUInt32BE(8);
        const body = pdu.subarray(16);

        if (cmdId === CMD.BIND_TRANSCEIVER_RESP) {
          if (cmdStatus !== 0) {
            return finish(
              new Error(`Échec d'authentification SMPP bind_transceiver (command_status=0x${cmdStatus.toString(16)})`)
            );
          }
          // Si on veut uniquement tester le Bind SMPP
          if (!smsPayload) {
            const unbind = buildPdu(CMD.UNBIND, Buffer.alloc(0), 2);
            socket.write(unbind);
            return finish(null, {
              ok: true,
              protocol: 'smpp_v34',
              latencyMs: Date.now() - start,
              systemId: body.toString('ascii').replace(/\0.*$/, '') || config.systemId
            });
          }
          // Sinon envoyer submit_sm
          const submitPdu = buildSubmitSmPdu(
            {
              senderId: smsPayload.senderId,
              to: smsPayload.to,
              text: smsPayload.body,
              ton: config.ton,
              npi: config.npi
            },
            2
          );
          socket.write(submitPdu);
        } else if (cmdId === CMD.SUBMIT_SM_RESP) {
          if (cmdStatus !== 0) {
            return finish(
              new Error(`Rejet SMPP submit_sm par le SMSC (command_status=0x${cmdStatus.toString(16)})`)
            );
          }
          const msgId = body.toString('ascii').replace(/\0.*$/, '') || `smpp-${Date.now()}`;
          const unbind = buildPdu(CMD.UNBIND, Buffer.alloc(0), 3);
          socket.write(unbind);
          return finish(null, {
            ok: true,
            providerId: msgId,
            latencyMs: Date.now() - start
          });
        }
      }
    });
  });
}

