import { describe, expect, it } from 'vitest';
import { DataMigrator } from '../../src/cli/DataMigrator';
import { SchemaBuilder } from '../../src/schema/SchemaBuilder';

describe('d1-migrator null normalization', () => {
  it('converts null-like strings to null during data transformation', async () => {
    const transformed = await DataMigrator.transformData(
      [
        {
          actualNull: null,
          upperNull: 'NULL',
          lowerNull: 'null',
          spacedNull: '  Null  ',
          otherText: 'NULLABLE',
        },
      ],
      'users'
    );

    expect(transformed).toEqual([
      {
        actualNull: null,
        upperNull: null,
        lowerNull: null,
        spacedNull: null,
        otherText: 'NULLABLE',
      },
    ]);
  });

  it('formats null-like schema defaults as SQL NULL', () => {
    expect(SchemaBuilder.formatDefaultValue(null)).toBe('NULL');
    expect(SchemaBuilder.formatDefaultValue('NULL')).toBe('NULL');
    expect(SchemaBuilder.formatDefaultValue('null')).toBe('NULL');
    expect(SchemaBuilder.formatDefaultValue(' Null ')).toBe('NULL');
    expect(SchemaBuilder.formatDefaultValue('NULLABLE')).toBe("'NULLABLE'");
  });
});
