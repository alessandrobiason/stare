import {
  bytesField,
  byteLengthOf,
  concat,
  fieldsOf,
  lengthDelimited,
  ProtoField,
  signedVarintAt,
  stringField,
  stringOf,
  varintField,
  WIRE_LENGTH_DELIMITED,
  WIRE_VARINT
} from "./onnxProto";

/**
 * The sky model, rewritten into the form Core ML can take whole.
 *
 * SkyWater-Seg is published with its batch and both spatial axes declared
 * dynamic, and in that form the Core ML execution provider cannot run it as one
 * model. Every reshape in the graph takes its target shape from a chain of
 * `Shape`, `Gather` and `Concat` evaluated at run time, and Core ML accepts a
 * reshape only against a constant; so does every slice. Handed the published
 * graph, the provider split it into about three hundred and fifty Core ML models
 * with the CPU running everything between them — hundreds of hand-offs between
 * the two on every pass, each one allocating on both sides, which is the run
 * the phone was killed for (see `skyModel.ts`).
 *
 * Three edits make it one model, none of which changes a single value the
 * network computes:
 *
 * 1. **The input's size is written in.** The phone only ever feeds the model one
 *    size (`modelInputSize` of `DEVICE_CAMERA`), and with that size fixed ONNX
 *    Runtime's own constant folding evaluates every shape chain before the graph
 *    is partitioned: the 81 `Shape` nodes and everything computed from them
 *    become constants, and the graph goes from 1,434 nodes to 727.
 *
 * 2. **Scalar-index gathers become gathers of one index and a squeeze.** What is
 *    left in the way is the attention: every block splits its keys from its
 *    values with `kv[0]` and `kv[1]`, which export as a `Gather` with a scalar
 *    index, and the provider's `Gather` refuses a scalar index. `Gather(x, [i])`
 *    followed by `Squeeze` on the same axis is the same tensor, and both halves
 *    are ones Core ML takes. Sixteen blocks, thirty-two gathers, seventeen Core
 *    ML models where there should be one.
 *
 * 3. **A cache key is written into the metadata.** The provider compiles the
 *    Core ML model at session creation, which for a network this size is many
 *    seconds, and the Neural Engine specialises it again on top. Given a cache
 *    directory it keeps the compiled model, but it keys the cache by a hash of
 *    the model's path unless the model names its own key, and it never checks
 *    whether the model behind a key has changed. So the key is written here,
 *    from everything that changes what gets compiled.
 *
 * Run once, on the file the app downloaded, and the result kept beside it: see
 * `preparedModel` in `skyModel.ts`. Nothing here touches a weight — the output
 * is the input's own bytes with a few kilobytes of messages replaced or added —
 * and it is made of views of the input rather than a copy of it, so a 95 MB
 * model does not need a second 95 MB to be rewritten.
 */

/** The result: the model's bytes, as parts to be written out in order. */
export type PreparedSkyModel = {
  parts: Uint8Array[];
  byteLength: number;
  /** How many scalar-index gathers were rewritten. */
  gathersRewritten: number;
};

export type SkyModelPreparation = {
  /**
   * The value of each of the model's named dimensions: its `dim_param`s, as
   * `batch`, `height` and `width` in SkyWater-Seg's export.
   */
  dimensions: Record<string, number>;
  /**
   * Written as the model's `COREML_CACHE_KEY`. The provider accepts only letters
   * and digits, 64 of them at most, and silently ignores anything else — so this
   * throws instead.
   */
  coreMlCacheKey: string;
};

// ModelProto
const MODEL_GRAPH = 7;
const MODEL_METADATA = 14;
// StringStringEntryProto
const ENTRY_KEY = 1;
const ENTRY_VALUE = 2;
// GraphProto
const GRAPH_NODE = 1;
const GRAPH_INITIALIZER = 5;
const GRAPH_INPUT = 11;
const GRAPH_OUTPUT = 12;
// NodeProto
const NODE_INPUT = 1;
const NODE_OUTPUT = 2;
const NODE_NAME = 3;
const NODE_OP_TYPE = 4;
const NODE_ATTRIBUTE = 5;
const NODE_DOMAIN = 7;
// AttributeProto
const ATTRIBUTE_NAME = 1;
const ATTRIBUTE_INT = 3;
// TensorProto
const TENSOR_DIMS = 1;
const TENSOR_DATA_TYPE = 2;
const TENSOR_NAME = 8;
const TENSOR_RAW_DATA = 9;
const TENSOR_DATA_LOCATION = 14;
const DATA_TYPE_INT32 = 6;
const DATA_TYPE_INT64 = 7;
// ValueInfoProto → TypeProto → TypeProto.Tensor → TensorShapeProto → Dimension
const VALUE_INFO_TYPE = 2;
const TYPE_TENSOR = 1;
const TENSOR_TYPE_SHAPE = 2;
const SHAPE_DIM = 1;
const DIM_VALUE = 1;
const DIM_PARAM = 2;

const COREML_CACHE_KEY = "COREML_CACHE_KEY";

/** Rewrites `model` for Core ML. See the note at the top of this file. */
export function prepareSkyModel(model: Uint8Array, preparation: SkyModelPreparation): PreparedSkyModel {
  const { coreMlCacheKey } = preparation;
  if (!/^[A-Za-z0-9]{1,64}$/.test(coreMlCacheKey)) {
    throw new Error(`"${coreMlCacheKey}" is not a Core ML cache key: letters and digits, 64 at most`);
  }

  const out = new PartWriter(model);
  let graphs = 0;
  let gathersRewritten = 0;
  for (const field of fieldsOf(model)) {
    if (field.number === MODEL_GRAPH && field.wireType === WIRE_LENGTH_DELIMITED) {
      graphs += 1;
      const graph = rewriteGraph(model, field, preparation.dimensions);
      gathersRewritten = graph.gathersRewritten;
      out.add(lengthDelimited(MODEL_GRAPH, graph.parts));
    } else if (field.number === MODEL_METADATA && metadataKey(model, field) === COREML_CACHE_KEY) {
      // Dropped, so the key written below is the only one.
    } else {
      out.keep(field);
    }
  }
  if (graphs !== 1) throw new Error(`Expected one graph in the sky model, found ${graphs}`);

  out.add([
    bytesField(
      MODEL_METADATA,
      concat([stringField(ENTRY_KEY, COREML_CACHE_KEY), stringField(ENTRY_VALUE, coreMlCacheKey)])
    )
  ]);
  const parts = out.finish();
  return { parts, byteLength: byteLengthOf(parts), gathersRewritten };
}

function rewriteGraph(
  model: Uint8Array,
  graph: ProtoField,
  dimensions: Record<string, number>
): { parts: Uint8Array[]; gathersRewritten: number } {
  const start = graph.payloadStart;
  const end = graph.end;

  // Every name in the graph, so a name made up below cannot collide with one,
  // and the scalar integer initializers a gather might be indexed by.
  const names = new Set<string>();
  const scalarIndices = new Map<string, ProtoField>();
  for (const field of fieldsOf(model, start, end)) {
    if (field.number === GRAPH_INITIALIZER) {
      const initializer = readInitializer(model, field);
      names.add(initializer.name);
      if (initializer.scalarInteger) scalarIndices.set(initializer.name, field);
    } else if (field.number === GRAPH_NODE) {
      for (const nodeField of fieldsOf(model, field.payloadStart, field.end)) {
        if (
          nodeField.number === NODE_INPUT ||
          nodeField.number === NODE_OUTPUT ||
          nodeField.number === NODE_NAME
        ) {
          names.add(stringOf(model, nodeField));
        }
      }
    }
  }
  const fresh = (name: string): string => {
    if (names.has(name)) throw new Error(`The sky model already has a value named "${name}"`);
    names.add(name);
    return name;
  };

  const out = new PartWriter(model);
  const oneIndex = new Map<string, string>();
  const squeezeAxes = new Map<number, string>();
  const added: Uint8Array[] = [];
  let gathersRewritten = 0;
  let unfixed: string[] = [];

  for (const field of fieldsOf(model, start, end)) {
    if (field.number === GRAPH_NODE) {
      const gather = scalarGather(model, field, scalarIndices);
      if (!gather) {
        out.keep(field);
        continue;
      }
      gathersRewritten += 1;

      let index = oneIndex.get(gather.indices);
      if (!index) {
        index = fresh(`${gather.indices}_as_1d`);
        oneIndex.set(gather.indices, index);
        added.push(oneElementInitializer(model, scalarIndices.get(gather.indices) as ProtoField, index));
      }
      let axes = squeezeAxes.get(gather.axis);
      if (!axes) {
        axes = fresh(`stare_squeeze_axes_${gather.axis < 0 ? `minus_${-gather.axis}` : gather.axis}`);
        squeezeAxes.set(gather.axis, axes);
        added.push(int64VectorInitializer(axes, gather.axis));
      }
      const kept = fresh(`${gather.output}_with_axis`);

      // The gather, indexed by the one-element tensor and so keeping its axis…
      out.add(lengthDelimited(GRAPH_NODE, [renameNodeValues(model, field, index, kept)]));
      // …and the squeeze that takes that axis back out, into the original name.
      const squeeze: Uint8Array[] = [
        stringField(NODE_INPUT, kept),
        stringField(NODE_INPUT, axes),
        stringField(NODE_OUTPUT, gather.output),
        stringField(NODE_OP_TYPE, "Squeeze")
      ];
      if (gather.name) squeeze.push(stringField(NODE_NAME, fresh(`${gather.name}_squeeze`)));
      out.add(lengthDelimited(GRAPH_NODE, squeeze));
    } else if (field.number === GRAPH_INPUT || field.number === GRAPH_OUTPUT) {
      const fixed = fixDimensions(model, field, dimensions);
      unfixed = unfixed.concat(fixed.unfixed);
      out.add(lengthDelimited(field.number, fixed.parts));
    } else {
      out.keep(field);
    }
  }

  if (unfixed.length > 0) {
    // A dimension left named is a graph Core ML would be handed dynamic again,
    // and nothing would say so but a slower, larger model. Better to fail here.
    throw new Error(`The sky model has dimensions nobody gave a size: ${[...new Set(unfixed)].join(", ")}`);
  }
  for (const initializer of added) out.add([initializer]);
  return { parts: out.finish(), gathersRewritten };
}

type ScalarGather = { name: string | null; indices: string; output: string; axis: number };

function scalarGather(
  model: Uint8Array,
  node: ProtoField,
  scalarIndices: Map<string, ProtoField>
): ScalarGather | null {
  let opType = "";
  let domain = "";
  let name: string | null = null;
  const inputs: string[] = [];
  const outputs: string[] = [];
  let axis = 0;
  for (const field of fieldsOf(model, node.payloadStart, node.end)) {
    switch (field.number) {
      case NODE_OP_TYPE:
        opType = stringOf(model, field);
        break;
      case NODE_DOMAIN:
        domain = stringOf(model, field);
        break;
      case NODE_NAME:
        name = stringOf(model, field);
        break;
      case NODE_INPUT:
        inputs.push(stringOf(model, field));
        break;
      case NODE_OUTPUT:
        outputs.push(stringOf(model, field));
        break;
      case NODE_ATTRIBUTE:
        axis = attributeInt(model, field, "axis") ?? axis;
        break;
    }
  }
  if (opType !== "Gather" || (domain !== "" && domain !== "ai.onnx")) return null;
  if (inputs.length !== 2 || outputs.length !== 1 || !scalarIndices.has(inputs[1])) return null;
  return { name, indices: inputs[1], output: outputs[0], axis };
}

/** A node's own bytes with its second input and first output renamed. */
function renameNodeValues(
  model: Uint8Array,
  node: ProtoField,
  secondInput: string,
  firstOutput: string
): Uint8Array {
  const out = new PartWriter(model);
  let inputs = 0;
  let outputs = 0;
  for (const field of fieldsOf(model, node.payloadStart, node.end)) {
    if (field.number === NODE_INPUT && inputs++ === 1) out.add([stringField(NODE_INPUT, secondInput)]);
    else if (field.number === NODE_OUTPUT && outputs++ === 0) {
      out.add([stringField(NODE_OUTPUT, firstOutput)]);
    } else out.keep(field);
  }
  return concat(out.finish());
}

function attributeInt(model: Uint8Array, attribute: ProtoField, wanted: string): number | null {
  let name = "";
  let value: number | null = null;
  for (const field of fieldsOf(model, attribute.payloadStart, attribute.end)) {
    if (field.number === ATTRIBUTE_NAME) name = stringOf(model, field);
    else if (field.number === ATTRIBUTE_INT && field.wireType === WIRE_VARINT) {
      value = signedVarintAt(model, field);
    }
  }
  return name === wanted ? value : null;
}

function readInitializer(
  model: Uint8Array,
  initializer: ProtoField
): { name: string; scalarInteger: boolean } {
  let name = "";
  let rank = 0;
  let dataType = 0;
  let external = false;
  for (const field of fieldsOf(model, initializer.payloadStart, initializer.end)) {
    switch (field.number) {
      case TENSOR_NAME:
        name = stringOf(model, field);
        break;
      case TENSOR_DIMS:
        // Repeated int64, packed or not: any at all is a rank above zero.
        rank += 1;
        break;
      case TENSOR_DATA_TYPE:
        dataType = field.varint;
        break;
      case TENSOR_DATA_LOCATION:
        external = field.varint === 1;
        break;
    }
  }
  const integer = dataType === DATA_TYPE_INT64 || dataType === DATA_TYPE_INT32;
  return { name, scalarInteger: rank === 0 && integer && !external };
}

/**
 * A scalar initializer as a one-element vector under a new name: its own type
 * and its own stored value, with a dimension of one added in front.
 */
function oneElementInitializer(model: Uint8Array, scalar: ProtoField, name: string): Uint8Array {
  const out = new PartWriter(model);
  out.add([varintField(TENSOR_DIMS, 1)]);
  for (const field of fieldsOf(model, scalar.payloadStart, scalar.end)) {
    if (field.number === TENSOR_NAME) out.add([stringField(TENSOR_NAME, name)]);
    else out.keep(field);
  }
  return concat(lengthDelimited(GRAPH_INITIALIZER, out.finish()));
}

/** `[value]` as an int64 initializer, stored raw and little-endian as ONNX has it. */
function int64VectorInitializer(name: string, value: number): Uint8Array {
  const raw = new Uint8Array(8);
  const view = new DataView(raw.buffer);
  const low = value < 0 ? (value % 2 ** 32) + 2 ** 32 : value % 2 ** 32;
  const high = value < 0 ? 0xffffffff - Math.floor(-(value + 1) / 2 ** 32) : Math.floor(value / 2 ** 32);
  view.setUint32(0, low >>> 0, true);
  view.setUint32(4, high >>> 0, true);
  return concat(
    lengthDelimited(GRAPH_INITIALIZER, [
      varintField(TENSOR_DIMS, 1),
      varintField(TENSOR_DATA_TYPE, DATA_TYPE_INT64),
      stringField(TENSOR_NAME, name),
      bytesField(TENSOR_RAW_DATA, raw)
    ])
  );
}

/**
 * A graph input or output with each named dimension replaced by its size.
 * Returns the names it found no size for, rather than leaving them quietly.
 */
function fixDimensions(
  model: Uint8Array,
  valueInfo: ProtoField,
  dimensions: Record<string, number>
): { parts: Uint8Array[]; unfixed: string[] } {
  const unfixed: string[] = [];
  const rewrite = (field: ProtoField, path: number[]): Uint8Array[] => {
    const out = new PartWriter(model);
    for (const inner of fieldsOf(model, field.payloadStart, field.end)) {
      if (inner.wireType !== WIRE_LENGTH_DELIMITED || inner.number !== path[0]) {
        out.keep(inner);
      } else if (path.length > 1) {
        out.add(lengthDelimited(inner.number, rewrite(inner, path.slice(1))));
      } else {
        out.add(lengthDelimited(inner.number, [fixDimension(inner)]));
      }
    }
    return out.finish();
  };
  const fixDimension = (dimension: ProtoField): Uint8Array => {
    const out = new PartWriter(model);
    for (const field of fieldsOf(model, dimension.payloadStart, dimension.end)) {
      const size = field.number === DIM_PARAM ? dimensions[stringOf(model, field)] : undefined;
      if (field.number === DIM_PARAM && size === undefined) unfixed.push(stringOf(model, field));
      if (size === undefined) out.keep(field);
      else out.add([varintField(DIM_VALUE, size)]);
    }
    return concat(out.finish());
  };
  return {
    parts: rewrite(valueInfo, [VALUE_INFO_TYPE, TYPE_TENSOR, TENSOR_TYPE_SHAPE, SHAPE_DIM]),
    unfixed
  };
}

function metadataKey(model: Uint8Array, entry: ProtoField): string | null {
  for (const field of fieldsOf(model, entry.payloadStart, entry.end)) {
    if (field.number === ENTRY_KEY) return stringOf(model, field);
  }
  return null;
}

/**
 * Collects the output as parts, keeping untouched runs of the source as single
 * views of it rather than one view per field: a graph of a few thousand fields
 * mostly left alone comes out as a few dozen parts to write.
 */
class PartWriter {
  private readonly parts: Uint8Array[] = [];
  private runStart = -1;
  private runEnd = -1;

  constructor(private readonly source: Uint8Array) {}

  keep(field: ProtoField): void {
    if (this.runEnd === field.start) {
      this.runEnd = field.end;
      return;
    }
    this.flush();
    this.runStart = field.start;
    this.runEnd = field.end;
  }

  add(parts: Uint8Array[]): void {
    this.flush();
    for (const part of parts) this.parts.push(part);
  }

  finish(): Uint8Array[] {
    this.flush();
    return this.parts;
  }

  private flush(): void {
    if (this.runStart >= 0) this.parts.push(this.source.subarray(this.runStart, this.runEnd));
    this.runStart = -1;
    this.runEnd = -1;
  }
}
