import {
  bytesField,
  concat,
  encodeVarint,
  fieldsOf,
  ProtoField,
  signedVarintAt,
  stringField,
  stringOf,
  tag,
  utf8Decode,
  utf8Encode,
  varintField,
  WIRE_VARINT
} from "../src/vision/onnxProto";
import { prepareSkyModel, SkyModelPreparation } from "../src/vision/skyModelPreparation";

// ONNX field numbers, from onnx.proto.
const MODEL = { irVersion: 1, opset: 8, graph: 7, metadata: 14 };
const GRAPH = { node: 1, initializer: 5, input: 11, output: 12 };
const NODE = { input: 1, output: 2, name: 3, opType: 4, attribute: 5 };
const TENSOR = { dims: 1, dataType: 2, name: 8, rawData: 9 };
const INT64 = 7;
const FLOAT = 1;

const message = (number: number, ...fields: Uint8Array[]) => bytesField(number, concat(fields));

function int64Raw(value: number): Uint8Array {
  const raw = new Uint8Array(8);
  const view = new DataView(raw.buffer);
  view.setInt32(0, value, true);
  view.setInt32(4, value < 0 ? -1 : 0, true);
  return raw;
}

function node(opType: string, inputs: string[], outputs: string[], name: string, axis?: number) {
  return message(
    GRAPH.node,
    ...inputs.map((input) => stringField(NODE.input, input)),
    ...outputs.map((output) => stringField(NODE.output, output)),
    stringField(NODE.name, name),
    stringField(NODE.opType, opType),
    ...(axis === undefined
      ? []
      : [message(NODE.attribute, stringField(1, "axis"), varintField(3, axis), varintField(20, 2))])
  );
}

function scalarInt64(name: string, value: number) {
  return message(
    GRAPH.initializer,
    varintField(TENSOR.dataType, INT64),
    stringField(TENSOR.name, name),
    bytesField(TENSOR.rawData, int64Raw(value))
  );
}

/** `data`, shaped [batch, 2, height], a named dimension at each end. */
function valueInfo(number: number, name: string, dims: (string | number)[]) {
  const dimensions = dims.map((dim) =>
    message(1, typeof dim === "string" ? stringField(2, dim) : varintField(1, dim))
  );
  return message(number, stringField(1, name), message(2, message(1, varintField(1, FLOAT), message(2, ...dimensions))));
}

const WEIGHTS = Uint8Array.from({ length: 64 }, (_, index) => index);

/**
 * A graph shaped like the one attention exports: a tensor split along its first
 * axis by two scalar-index gathers, one of them with a negative axis, and an
 * ordinary op downstream.
 */
function model({ extraInitializer }: { extraInitializer?: Uint8Array } = {}) {
  return concat([
    varintField(MODEL.irVersion, 8),
    message(MODEL.opset, varintField(2, 17)),
    message(
      MODEL.graph,
      node("Gather", ["kv", "zero"], ["k"], "attn/Gather_3", 0),
      node("Gather", ["kv", "one"], ["v"], "attn/Gather_4", -3),
      node("MatMul", ["k", "v"], ["scores"], "attn/MatMul"),
      scalarInt64("zero", 0),
      scalarInt64("one", 1),
      message(
        GRAPH.initializer,
        varintField(TENSOR.dims, 64),
        varintField(TENSOR.dataType, FLOAT),
        stringField(TENSOR.name, "weights"),
        bytesField(TENSOR.rawData, WEIGHTS)
      ),
      ...(extraInitializer ? [extraInitializer] : []),
      valueInfo(GRAPH.input, "kv", [2, "batch", "height", "width"]),
      valueInfo(GRAPH.output, "scores", ["batch", "height", "width", "width"])
    ),
    message(MODEL.metadata, stringField(1, "COREML_CACHE_KEY"), stringField(2, "stale"))
  ]);
}

const PREPARATION: SkyModelPreparation = {
  dimensions: { batch: 1, height: 448, width: 320 },
  coreMlCacheKey: "skywaterb2w320h448v1"
};

// Reading the result back.

type Node = { opType: string; inputs: string[]; outputs: string[]; name: string; axis: number | null };

function prepared(bytes = model(), preparation = PREPARATION) {
  const result = prepareSkyModel(bytes, preparation);
  return { ...result, bytes: concat(result.parts), source: bytes };
}

function only(bytes: Uint8Array, number: number, start = 0, end = bytes.length): ProtoField[] {
  return [...fieldsOf(bytes, start, end)].filter((field) => field.number === number);
}

function graphOf(bytes: Uint8Array): ProtoField {
  const graphs = only(bytes, MODEL.graph);
  expect(graphs).toHaveLength(1);
  return graphs[0];
}

function nodesOf(bytes: Uint8Array): Node[] {
  const graph = graphOf(bytes);
  return only(bytes, GRAPH.node, graph.payloadStart, graph.end).map((field) => {
    const result: Node = { opType: "", inputs: [], outputs: [], name: "", axis: null };
    for (const inner of fieldsOf(bytes, field.payloadStart, field.end)) {
      if (inner.number === NODE.opType) result.opType = stringOf(bytes, inner);
      if (inner.number === NODE.input) result.inputs.push(stringOf(bytes, inner));
      if (inner.number === NODE.output) result.outputs.push(stringOf(bytes, inner));
      if (inner.number === NODE.name) result.name = stringOf(bytes, inner);
      if (inner.number === NODE.attribute) {
        for (const attribute of fieldsOf(bytes, inner.payloadStart, inner.end)) {
          if (attribute.number === 3) result.axis = signedVarintAt(bytes, attribute);
        }
      }
    }
    return result;
  });
}

type Tensor = { name: string; dims: number[]; dataType: number; raw: Uint8Array | null };

function initializersOf(bytes: Uint8Array): Tensor[] {
  const graph = graphOf(bytes);
  return only(bytes, GRAPH.initializer, graph.payloadStart, graph.end).map((field) => {
    const tensor: Tensor = { name: "", dims: [], dataType: 0, raw: null };
    for (const inner of fieldsOf(bytes, field.payloadStart, field.end)) {
      if (inner.number === TENSOR.name) tensor.name = stringOf(bytes, inner);
      if (inner.number === TENSOR.dims) tensor.dims.push(inner.varint);
      if (inner.number === TENSOR.dataType) tensor.dataType = inner.varint;
      if (inner.number === TENSOR.rawData) tensor.raw = bytes.subarray(inner.payloadStart, inner.end);
    }
    return tensor;
  });
}

function dimsOf(bytes: Uint8Array, number: number): (string | number)[] {
  const graph = graphOf(bytes);
  const [info] = only(bytes, number, graph.payloadStart, graph.end);
  const walk = (field: ProtoField, path: number[]): ProtoField[] =>
    path.length === 0
      ? [field]
      : only(bytes, path[0], field.payloadStart, field.end).flatMap((inner) => walk(inner, path.slice(1)));
  return walk(info, [2, 1, 2, 1]).map((dimension) => {
    const [inner] = [...fieldsOf(bytes, dimension.payloadStart, dimension.end)];
    return inner.number === 1 ? inner.varint : stringOf(bytes, inner);
  });
}

function int64s(raw: Uint8Array | null): number[] {
  const view = new DataView((raw as Uint8Array).buffer, (raw as Uint8Array).byteOffset, (raw as Uint8Array).length);
  return Array.from({ length: view.byteLength / 8 }, (_, index) =>
    view.getInt32(index * 8 + 4, true) * 2 ** 32 + view.getUint32(index * 8, true)
  );
}

describe("the wire format", () => {
  test.each([0, 1, 127, 128, 300, 2 ** 31, 2 ** 40 + 7, -1, -3, -(2 ** 32), -(2 ** 32) - 1, -(2 ** 40)])(
    "carries %p through a varint unchanged",
    (value) => {
      const bytes = concat([tag(3, WIRE_VARINT), encodeVarint(value)]);
      const [field] = [...fieldsOf(bytes)];
      expect(signedVarintAt(bytes, field)).toBe(value);
      if (value >= 0) expect(field.varint).toBe(value);
    }
  );

  test("writes a negative number as the ten bytes of its two's complement", () => {
    expect(Array.from(encodeVarint(-1))).toEqual([255, 255, 255, 255, 255, 255, 255, 255, 255, 1]);
  });

  test("carries text through UTF-8 unchanged", () => {
    const text = "/encoder/block1 · Ω ✓ 🛰";
    expect(utf8Decode(utf8Encode(text))).toBe(text);
    expect(Array.from(utf8Encode("é"))).toEqual([0xc3, 0xa9]);
  });

  test("refuses a field that runs past the end of its message", () => {
    const truncated = bytesField(1, new Uint8Array(10)).subarray(0, 6);
    expect(() => [...fieldsOf(truncated)]).toThrow("runs past the end");
  });
});

describe("preparing the sky model for Core ML", () => {
  test("splits each scalar-index gather into a gather that keeps its axis and a squeeze that drops it", () => {
    const { bytes, gathersRewritten } = prepared();
    expect(gathersRewritten).toBe(2);
    expect(nodesOf(bytes)).toEqual([
      { opType: "Gather", inputs: ["kv", "zero_as_1d"], outputs: ["k_with_axis"], name: "attn/Gather_3", axis: 0 },
      {
        opType: "Squeeze",
        inputs: ["k_with_axis", "stare_squeeze_axes_0"],
        outputs: ["k"],
        name: "attn/Gather_3_squeeze",
        axis: null
      },
      { opType: "Gather", inputs: ["kv", "one_as_1d"], outputs: ["v_with_axis"], name: "attn/Gather_4", axis: -3 },
      {
        opType: "Squeeze",
        inputs: ["v_with_axis", "stare_squeeze_axes_minus_3"],
        outputs: ["v"],
        name: "attn/Gather_4_squeeze",
        axis: null
      },
      // Downstream of both, and reading the same names it always did.
      { opType: "MatMul", inputs: ["k", "v"], outputs: ["scores"], name: "attn/MatMul", axis: null }
    ]);
  });

  test("indexes each gather by its own value as a one-element vector, and squeezes the axis it gathered on", () => {
    const tensors = new Map(initializersOf(prepared().bytes).map((tensor) => [tensor.name, tensor]));
    // The originals are left for anything else that reads them.
    expect(tensors.get("zero")?.dims).toEqual([]);
    expect(tensors.get("zero_as_1d")).toMatchObject({ dims: [1], dataType: INT64 });
    expect(int64s(tensors.get("zero_as_1d")?.raw ?? null)).toEqual([0]);
    expect(int64s(tensors.get("one_as_1d")?.raw ?? null)).toEqual([1]);
    expect(tensors.get("stare_squeeze_axes_0")).toMatchObject({ dims: [1], dataType: INT64 });
    expect(int64s(tensors.get("stare_squeeze_axes_0")?.raw ?? null)).toEqual([0]);
    expect(int64s(tensors.get("stare_squeeze_axes_minus_3")?.raw ?? null)).toEqual([-3]);
  });

  test("writes every named dimension of the inputs and outputs as its size", () => {
    const { bytes } = prepared();
    expect(dimsOf(bytes, GRAPH.input)).toEqual([2, 1, 448, 320]);
    expect(dimsOf(bytes, GRAPH.output)).toEqual([1, 448, 320, 320]);
  });

  test("writes the cache key into the metadata in place of any the model already carried", () => {
    const { bytes } = prepared();
    const entries = only(bytes, MODEL.metadata).map((field) =>
      [...fieldsOf(bytes, field.payloadStart, field.end)].map((inner) => stringOf(bytes, inner))
    );
    expect(entries).toEqual([["COREML_CACHE_KEY", "skywaterb2w320h448v1"]]);
  });

  test("leaves the weights where they were rather than copying them", () => {
    const { parts, source, bytes } = prepared();
    const weights = initializersOf(bytes).find((tensor) => tensor.name === "weights");
    expect(Array.from(weights?.raw ?? [])).toEqual(Array.from(WEIGHTS));
    // At least one part is a view of the source, which is what lets a 95 MB
    // model be written out without a second 95 MB of it in memory.
    expect(parts.some((part) => part.buffer === source.buffer)).toBe(true);
  });

  test("changes nothing that is not a scalar gather, a named dimension or the cache key", () => {
    const plain = concat([
      varintField(MODEL.irVersion, 8),
      message(MODEL.graph, node("Relu", ["x"], ["y"], "relu"), valueInfo(GRAPH.input, "x", [1, 3]))
    ]);
    const { bytes, gathersRewritten } = prepared(plain);
    expect(gathersRewritten).toBe(0);
    expect(Array.from(bytes.subarray(0, plain.length))).toEqual(Array.from(plain));
  });

  test("refuses to leave a dimension nobody gave a size", () => {
    expect(() =>
      prepareSkyModel(model(), { ...PREPARATION, dimensions: { batch: 1, height: 448 } })
    ).toThrow("dimensions nobody gave a size: width");
  });

  test("refuses a cache key the provider would ignore", () => {
    expect(() => prepareSkyModel(model(), { ...PREPARATION, coreMlCacheKey: "sky-model" })).toThrow(
      "not a Core ML cache key"
    );
    expect(() => prepareSkyModel(model(), { ...PREPARATION, coreMlCacheKey: "a".repeat(65) })).toThrow(
      "not a Core ML cache key"
    );
  });

  test("refuses to invent a name the graph already uses", () => {
    expect(() => prepareSkyModel(model({ extraInitializer: scalarInt64("zero_as_1d", 5) }), PREPARATION)).toThrow(
      'already has a value named "zero_as_1d"'
    );
  });
});
