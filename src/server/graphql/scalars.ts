import { GraphQLError, GraphQLScalarType, Kind, type ValueNode } from "graphql";

/**
 * Permissive JSON scalar — used for Excalidraw scene payloads
 * (elements / appState / files are arbitrary nested JSON).
 */
export const GraphQLJSON = new GraphQLScalarType({
  name: "JSON",
  description:
    "Arbitrary JSON value, used for Excalidraw scene payloads (elements, appState, files).",

  serialize(value: unknown): unknown {
    return value;
  },

  parseValue(value: unknown): unknown {
    return value;
  },

  parseLiteral(ast: ValueNode): unknown {
    return parseLiteralToValue(ast);
  },
});

function parseLiteralToValue(ast: ValueNode): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
    case Kind.INT:
    case Kind.FLOAT:
    case Kind.ENUM:
      return ast.value;
    case Kind.OBJECT: {
      const value: Record<string, unknown> = {};
      for (const field of ast.fields) {
        value[field.name.value] = parseLiteralToValue(field.value);
      }
      return value;
    }
    case Kind.LIST:
      return ast.values.map((item) => parseLiteralToValue(item));
    case Kind.NULL:
      return null;
    default:
      throw new GraphQLError(`JSON scalar cannot represent value of kind ${ast.kind}`);
  }
}
