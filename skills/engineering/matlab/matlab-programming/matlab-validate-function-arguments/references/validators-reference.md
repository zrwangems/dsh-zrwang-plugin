# Validators Reference

Complete reference for built-in validation functions available in `arguments` blocks.

## Numeric Value Validators

| Function | Validates | Example |
|----------|-----------|---------|
| `mustBePositive` | All elements > 0 | `x (1,1) {mustBePositive}` |
| `mustBeNonnegative` | All elements >= 0 | `x (1,1) {mustBeNonnegative}` |
| `mustBeNegative` | All elements < 0 | `x (1,1) {mustBeNegative}` |
| `mustBeNonpositive` | All elements <= 0 | `x (1,1) {mustBeNonpositive}` |
| `mustBeFinite` | No Inf or NaN | `x (:,:) {mustBeFinite}` |
| `mustBeNonNan` | No NaN (Inf allowed) | `x (:,:) {mustBeNonNan}` |
| `mustBeNonmissing` | No missing values (NaT, `missing`, `""`, NaN) | R2020b+. Works across types |
| `mustBeNonzero` | All elements ~= 0 | `x (1,1) {mustBeNonzero}` |
| `mustBeReal` | No imaginary part | `x (:,1) {mustBeReal}` |
| `mustBeInteger` | value == floor(value) | `n (1,1) {mustBeInteger}` |

## Comparison Validators

| Function | Syntax | Notes |
|----------|--------|-------|
| `mustBeGreaterThan` | `mustBeGreaterThan(x, c)` | Strict > |
| `mustBeLessThan` | `mustBeLessThan(x, c)` | Strict < |
| `mustBeGreaterThanOrEqual` | `mustBeGreaterThanOrEqual(x, c)` | >= |
| `mustBeLessThanOrEqual` | `mustBeLessThanOrEqual(x, c)` | <= |
| `mustBeBetween` | `mustBeBetween(x, lo, hi, type)` | R2025a+. See boundary types below |

### mustBeBetween Boundary Types (R2025a+)

`mustBeBetween` was introduced in R2025a, replacing `mustBeInRange`. For R2024b and earlier, use `mustBeGreaterThan`/`mustBeLessThan`/`mustBeGreaterThanOrEqual`/`mustBeLessThanOrEqual` in combination.

| Type | Meaning | Includes lo? | Includes hi? |
|------|---------|:---:|:---:|
| `"closed"` | [lo, hi] | Yes | Yes |
| `"open"` | (lo, hi) | No | No |
| `"openleft"` | (lo, hi] | No | Yes |
| `"openright"` | [lo, hi) | Yes | No |
| `"closedleft"` | [lo, hi) | Yes | No |
| `"closedright"` | (lo, hi] | No | Yes |

**Note:** `"exclusive"` and `"inclusive"` are NOT valid boundary types.

```matlab
% Normalized frequency strictly between 0 and 1
cutoff (1,1) double {mustBeBetween(cutoff, 0, 1, "open")}

% Gain between 0 and 1, endpoints included
gain (1,1) double {mustBeBetween(gain, 0, 1, "closed")}
```

## Membership Validators

| Function | Syntax | Notes |
|----------|--------|-------|
| `mustBeMember` | `mustBeMember(x, set)` | Exact membership in set |

```matlab
method (1,1) string {mustBeMember(method, ["linear","cubic","spline"])}
```

## Data Type Validators

| Function | Syntax | Notes |
|----------|--------|-------|
| `mustBeA` | `mustBeA(x, classnames)` | Strict class check, no conversion |
| `mustBeNumeric` | `mustBeNumeric(x)` | Any numeric type |
| `mustBeNumericOrLogical` | `mustBeNumericOrLogical(x)` | Numeric or logical |
| `mustBeFloat` | `mustBeFloat(x)` | Single or double only |
| `mustBeUnderlyingType` | `mustBeUnderlyingType(x, typename)` | Check underlying type |

### When to use which

```matlab
% Accept any numeric type (int32, single, double, uint8, etc.)
data {mustBeNumeric}

% Accept only floating-point (single or double), reject int/char
signal {mustBeFloat}

% Accept only double, reject everything else (no conversion)
x {mustBeA(x, "double")}

% Accept single or double (equivalent to mustBeFloat)
x {mustBeA(x, ["single", "double"])}
```

## Size Validators

| Function | Validates | Notes |
|----------|-----------|-------|
| `mustBeNonempty` | Not empty | `numel > 0` |
| `mustBeScalarOrEmpty` | 1x1 or 0x0 | |
| `mustBeVector` | Row or column vector | Also accepts scalars (1x1 counts as a vector) |
| `mustBeRow` | Exactly 1-by-N | R2024b+. **Rejects columns** (unlike `(1,:)` which reshapes) |
| `mustBeColumn` | Exactly M-by-1 | R2024b+. **Rejects rows** (unlike `(:,1)` which reshapes) |
| `mustBeMatrix` | Exactly 2-D (M-by-N) | R2024b+ |
| `mustBeSorted` | Elements in sorted order | R2026a+ |

### Size specs vs size validators

| Declaration | Column input [1;2;3] | Why |
|-------------|---------------------|-----|
| `x (1,:)` | Reshaped to [1 2 3] | Size spec reshapes |
| `x {mustBeRow}` | **Error** | Validator rejects |
| `x {mustBeVector}` | Accepted as-is (stays column) | Flexible |

## Text Validators

| Function | Validates | Notes |
|----------|-----------|-------|
| `mustBeText` | string, char, or cellstr | Broad text acceptance |
| `mustBeTextScalar` | Single piece of text | One string or one char vector |
| `mustBeNonzeroLengthText` | Non-empty text | Rejects `""` and `''` |
| `mustBeFile` | Path to existing file | |
| `mustBeFolder` | Path to existing folder | |
| `mustBeValidVariableName` | Valid MATLAB variable name | |

### Text migration guidance

| Original | Strict equivalent | Modernized equivalent |
|----------|------------------|----------------------|
| `@ischar` | `{mustBeA(x, 'char')}` | `{mustBeTextScalar}` (also accepts string) |
| `@isstring` | `{mustBeA(x, 'string')}` | `(1,1) string` |
| `@(x) ischar(x) \|\| isstring(x)` | `{mustBeTextScalar}` | `{mustBeTextScalar}` |

## Sparsity Validators

| Function | Validates |
|----------|-----------|
| `mustBeNonsparse` | Not sparse |
| `mustBeSparse` | Is sparse |

## Writing Custom Validators

```matlab
function mustBeEven(x)
    if any(mod(x, 2) ~= 0)
        error("mustBeEven:notEven", "Value must be even, got %d.", x);
    end
end
```

Requirements:
- First argument is the value being validated
- No return values — throw error on failure
- No side effects — must not modify state, write files, or depend on changing external state
- Can accept additional arguments: `{mustBeEven(n)}`
- Parameterized: `{mustBeBetween(x, 0, 1, "open")}`

## Validation Order

For each argument (processed top to bottom):
1. **Class conversion** — implicit type coercion (e.g., char→double, single→double)
2. **Size adjustment** — reshaping vectors, scalar expansion
3. **Validation functions** — left to right; first error stops

### Walkthrough

Given `x (1,:) double {mustBePositive}` and input `uint8([5;3;1])`:

```
Input:        uint8([5; 3; 1])    — class=uint8, size=3x1
After class:  double([5; 3; 1])   — class=double, size=3x1
After size:   double([5  3  1])   — class=double, size=1x3 (column→row)
Validator:    mustBePositive sees [5 3 1] — passes
```

Given `x (1,3) double` and input `"42"`:

```
Input:        "42"                 — class=string, size=1x1
After class:  double(42)           — class=double, size=1x1
After size:   double([42 42 42])   — class=double, size=1x3 (scalar expansion)
```

### Consequences

- **Validators never see the original input type.** A `mustBeNumeric` validator on a `double`-declared argument will never catch char input — it's already converted to double before the validator runs. To reject non-numeric input, omit the class spec: `x {mustBeNumeric}`
- **Size checks reject matrices, not mismatched vectors.** `(1,:)` accepts column vectors (transposes them) but rejects 2D matrices even if element count matches
- **Scalar expansion happens after class conversion.** A scalar `"42"` passed to `(1,3) double` becomes `double(42)` first, then expands to `[42 42 42]`

----

Copyright 2026 The MathWorks, Inc.

----
