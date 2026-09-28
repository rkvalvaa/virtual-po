import { describe, expect, it } from 'vitest';
import { definitionProblems, validateAnswers, type FormDefinition } from './definition';

const base: FormDefinition = {
  title: 'Change a listing page',
  instructions: 'Tell us what should change.',
  titleFieldKey: 'summary',
  maxAttachments: 3,
  fields: [
    { key: 'summary', label: 'Summary', type: 'TEXT', required: true, options: [], showIf: null },
    { key: 'area', label: 'Area', type: 'SELECT', required: true, options: ['Listings', 'Search'], showIf: null },
    { key: 'listing_url', label: 'Listing URL', type: 'TEXT', required: true, options: [], showIf: { fieldKey: 'area', equals: 'Listings' } },
    { key: 'details', label: 'Details', type: 'LONG_TEXT', required: false, options: [], showIf: null },
    { key: 'volume', label: 'Listings affected', type: 'NUMBER', required: false, options: [], showIf: null },
    { key: 'deadline', label: 'Deadline', type: 'DATE', required: false, options: [], showIf: null },
  ],
};

describe('definitionProblems', () => {
  it('accepts a valid definition for publishing', () => {
    expect(definitionProblems(base, { publish: true })).toEqual([]);
  });

  it('allows an empty draft but not an empty published form', () => {
    const empty = { ...base, fields: [], titleFieldKey: null };
    expect(definitionProblems(empty, { publish: false })).toEqual([]);
    expect(definitionProblems(empty, { publish: true })).toContain('Add at least one field.');
  });

  it('rejects duplicate keys, empty selects and conditions on later or unknown fields', () => {
    const problems = definitionProblems({
      ...base,
      fields: [
        { key: 'summary', label: 'Summary', type: 'TEXT', required: true, options: [], showIf: { fieldKey: 'area', equals: 'Listings' } },
        { key: 'summary', label: 'Again', type: 'TEXT', required: false, options: [], showIf: null },
        { key: 'area', label: 'Area', type: 'SELECT', required: true, options: [], showIf: null },
      ],
    }, { publish: true });
    expect(problems).toEqual(expect.arrayContaining([
      'Field keys must be unique: summary.',
      'Area needs at least one option.',
      'Summary can only depend on a field above it.',
    ]));
  });

  it('requires a condition on a choice field to name one of its options', () => {
    const fields = base.fields.map((f) => f.key === 'listing_url' ? { ...f, showIf: { fieldKey: 'area', equals: 'Nope' } } : f);
    expect(definitionProblems({ ...base, fields }, { publish: true })).toContain('Listing URL depends on a value Area does not offer.');
  });

  it('requires the request title to come from an always-shown required text field', () => {
    expect(definitionProblems({ ...base, titleFieldKey: 'details' }, { publish: true }))
      .toContain('The request title must come from a required, always-shown short text field.');
    expect(definitionProblems({ ...base, titleFieldKey: 'listing_url' }, { publish: true }))
      .toContain('The request title must come from a required, always-shown short text field.');
  });
});

describe('validateAnswers', () => {
  it('coerces values and drops unknown keys', () => {
    const result = validateAnswers(base, {
      summary: '  New hero image ', area: 'Search', volume: '12', deadline: '2026-11-01', injected: 'x',
    });
    expect(result).toEqual({ ok: true, errors: {}, values: {
      summary: 'New hero image', area: 'Search', details: null, volume: 12, deadline: '2026-11-01',
    } });
  });

  it('requires a conditional field only while it is shown, and drops it when hidden', () => {
    expect(validateAnswers(base, { summary: 'S', area: 'Listings' }).errors).toEqual({ listing_url: 'Listing URL is required' });
    const hidden = validateAnswers(base, { summary: 'S', area: 'Search', listing_url: 'https://smuggled.example' });
    expect(hidden.ok).toBe(true);
    expect(hidden.values).not.toHaveProperty('listing_url');
  });

  it('rejects values outside the definition', () => {
    const result = validateAnswers(base, { summary: 'S', area: 'Other', volume: 'many', deadline: '2026-02-30' });
    expect(Object.keys(result.errors).sort()).toEqual(['area', 'deadline', 'volume']);
  });

  it('bounds text length', () => {
    const result = validateAnswers(base, { summary: 'x'.repeat(501), area: 'Search', details: 'y'.repeat(5001) });
    expect(result.errors).toEqual({ summary: 'Summary must be at most 500 characters', details: 'Details must be at most 5000 characters' });
  });
});
