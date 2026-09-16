/**
 * Just enough of the protobuf wire format to edit an ONNX model in place.
 *
 * The sky model is a 95 MB protobuf, and what `skyModelPreparation` changes in
 * it is a few dozen small messages among thousands of large ones. A general
 * protobuf library would decode the whole file into objects — every weight
 * tensor copied out of the buffer and back in — to change a handful of names.
 * The wire format is simple enough that this does not have to: a message is a
 * flat run of fields, each prefixed with its number and, for anything nested,
 * its length, so a field can be found, skipped or copied by its bytes without
 * understanding what is inside it.
 *
 * Deliberately small. It reads and writes the four wire types and nothing
 * else: no schema, no groups (which ONNX does not use), no packed-field
 * decoding beyond what the callers here ask for.
 */

export const WIRE_VARINT = 0;
export const WIRE_FIXED64 = 1;
export const WIRE_LENGTH_DELIMITED = 2;
export const WIRE_FIXED32 = 5;

/** One field of a message, located in the buffer it was read from. */
export type ProtoField = {
  number: number;
  wireType: number;
  /** Where the whole field starts, tag included: what to copy to keep it as it was. */
  start: number;
  /** Where the whole field ends. */
  end: number;
  /**
   * Where the payload starts: after the length for a length-delimited field,
   * after the tag for everything else.
   */
  payloadStart: number;
  /** A varint field's value, read as a number; 0 for the other wire types. */
  varint: number;
};

/**
 * The fields of the message in `bytes[start, end)`, in the order they are written.
 *
 * A varint above 2^53 comes back rounded, which no length, tag or ONNX
 * enumeration can be; a signed 64-bit value is read with `signedVarintAt`.
 */
export function* fieldsOf(
  bytes: Uint8Array,
  start = 0,
  end = bytes.length
): Generator<ProtoField, void, void> {
  let offset = start;
  while (offset < end) {
    const fieldStart = offset;
    const [tag, afterTag] = readVarint(bytes, offset);
    const number = Math.floor(tag / 8);
    const wireType = tag % 8;
    let payloadStart = afterTag;
    let varint = 0;
    switch (wireType) {
      case WIRE_VARINT:
        [varint, offset] = readVarint(bytes, afterTag);
        break;
      case WIRE_FIXED64:
        offset = afterTag + 8;
        break;
      case WIRE_LENGTH_DELIMITED: {
        const [length, afterLength] = readVarint(bytes, afterTag);
        payloadStart = afterLength;
        offset = afterLength + length;
        break;
      }
      case WIRE_FIXED32:
        offset = afterTag + 4;
        break;
      default:
        throw new Error(`Unsupported protobuf wire type ${wireType} at byte ${fieldStart}`);
    }
    if (offset > end) {
      throw new Error(`A protobuf field at byte ${fieldStart} runs past the end of its message`);
    }
    yield { number, wireType, start: fieldStart, end: offset, payloadStart, varint };
  }
}

/** A length-delimited field's payload, as a view of the buffer it was read from. */
export function payloadOf(bytes: Uint8Array, field: ProtoField): Uint8Array {
  return bytes.subarray(field.payloadStart, field.end);
}

/** A length-delimited field's payload, as text. */
export function stringOf(bytes: Uint8Array, field: ProtoField): string {
  return utf8Decode(payloadOf(bytes, field));
}

/**
 * A varint field read as a signed 64-bit integer — how ONNX stores an
 * attribute's `i`, where a negative axis is written as ten bytes of two's
 * complement. Exact for anything within ±2^53.
 */
export function signedVarintAt(bytes: Uint8Array, field: ProtoField): number {
  let low = 0;
  let high = 0;
  let offset = field.start;
  // Past the tag.
  while (bytes[offset] & 0x80) offset += 1;
  offset += 1;
  for (let shift = 0; shift < 70; shift += 7) {
    const byte = bytes[offset];
    offset += 1;
    const bits = byte & 0x7f;
    if (shift < 28) low |= bits << shift;
    else if (shift === 28) {
      low |= (bits & 0x0f) << 28;
      high |= bits >>> 4;
    } else high |= bits << (shift - 32);
    if (!(byte & 0x80)) break;
  }
  low >>>= 0;
  high >>>= 0;
  return high & 0x80000000 ? -((~high >>> 0) * 2 ** 32 + ((~low >>> 0) + 1)) : high * 2 ** 32 + low;
}

function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let scale = 1;
  for (let at = offset; at < bytes.length; at += 1) {
    const byte = bytes[at];
    value += (byte & 0x7f) * scale;
    if (!(byte & 0x80)) return [value, at + 1];
    scale *= 128;
  }
  throw new Error(`A protobuf varint at byte ${offset} runs past the end of the buffer`);
}

/** A varint, of a non-negative integer or a signed one within ±2^53. */
export function encodeVarint(value: number): Uint8Array {
  if (!Number.isInteger(value)) throw new Error(`Cannot encode ${value} as a varint`);
  // Negative values are the low 64 bits of their two's complement.
  let high = value < 0 ? ~Math.floor(-value / 2 ** 32) >>> 0 : Math.floor(value / 2 ** 32);
  let low = value < 0 ? (~((-value % 2 ** 32) >>> 0) + 1) >>> 0 : value >>> 0;
  if (value < 0 && low === 0) high = (high + 1) >>> 0;
  const out: number[] = [];
  do {
    out.push((low & 0x7f) | 0x80);
    low = ((low >>> 7) | ((high & 0x7f) << 25)) >>> 0;
    high >>>= 7;
  } while (low !== 0 || high !== 0);
  out[out.length - 1] &= 0x7f;
  return Uint8Array.from(out);
}

/** A field's tag: its number and wire type. */
export function tag(number: number, wireType: number): Uint8Array {
  return encodeVarint(number * 8 + wireType);
}

/** A varint field, whole. */
export function varintField(number: number, value: number): Uint8Array {
  return concat([tag(number, WIRE_VARINT), encodeVarint(value)]);
}

/** A string field, whole. */
export function stringField(number: number, value: string): Uint8Array {
  return bytesField(number, utf8Encode(value));
}

/** A bytes (or nested message) field, whole, from one payload. */
export function bytesField(number: number, payload: Uint8Array): Uint8Array {
  return concat(lengthDelimited(number, [payload]));
}

/**
 * A length-delimited field whose payload is `parts` laid end to end, as the
 * parts themselves behind a header rather than one copied buffer. How a graph
 * of 95 MB is rewritten without a second 95 MB of it being built in memory.
 */
export function lengthDelimited(number: number, parts: Uint8Array[]): Uint8Array[] {
  return [concat([tag(number, WIRE_LENGTH_DELIMITED), encodeVarint(byteLengthOf(parts))]), ...parts];
}

export function byteLengthOf(parts: readonly Uint8Array[]): number {
  let length = 0;
  for (const part of parts) length += part.length;
  return length;
}

/** `parts` in one buffer. For small things only: see `lengthDelimited`. */
export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(byteLengthOf(parts));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** UTF-8, by hand: nothing in the app can count on `TextEncoder` under Hermes. */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0) as number;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return Uint8Array.from(out);
}

export function utf8Decode(bytes: Uint8Array): string {
  let text = "";
  for (let offset = 0; offset < bytes.length; ) {
    const lead = bytes[offset];
    let code: number;
    let size: number;
    if (lead < 0x80) [code, size] = [lead, 1];
    else if (lead < 0xe0) [code, size] = [lead & 0x1f, 2];
    else if (lead < 0xf0) [code, size] = [lead & 0x0f, 3];
    else [code, size] = [lead & 0x07, 4];
    for (let index = 1; index < size; index += 1) code = (code << 6) | (bytes[offset + index] & 0x3f);
    text += String.fromCodePoint(code);
    offset += size;
  }
  return text;
}
