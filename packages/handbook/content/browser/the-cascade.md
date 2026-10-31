---
title: The cascade, and why the later rule lost
question: My rule is right there and the browser is ignoring it. Why?
order: 7
practise:
  - css-specificity-order
  - css-box-sizing
  - css-em-vs-rem
sources:
  - author: W3C
    title: CSS Cascading and Inheritance Level 5
    url: https://www.w3.org/TR/css-cascade-5/
  - author: MDN
    title: Specificity
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Specificity
  - author: MDN
    title: '@layer'
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@layer
  - author: MDN
    title: box-sizing
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/box-sizing
  - author: MDN
    title: length
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length
  - author: web.dev
    title: The cascade
    url: https://web.dev/learn/css/the-cascade
verified: 2026-08-01
---

Two CSS rules can try to set the same thing on the same element, say two colours for one link, and
only one of them gets applied. The browser picks by a fixed ranking, and which rule comes later in
the file is the last thing it checks, not the first. Expect the later rule to win and some fixes
seem to do nothing, which tends to end in heavier and heavier selectors that nobody dares change.

## The model

When two declarations set the same property on the same element, the browser does not take the one
it read last. It runs a fixed sequence, and document order is the bottom of it. CSS Cascading and
Inheritance Level 5 defines the order, highest priority first:

1. **Origin and importance.** Where the declaration came from (the browser's own stylesheet, the
   user's, yours) and whether it carries `!important`. Your normal rules sit low in that list.
2. **Element-attached styles.** A `style` attribute beats any selector of the same importance.
   (Shadow DOM encapsulation is compared one step above this, and rarely decides anything you
   are debugging.)
3. **Layer.** Among normal declarations, the later `@layer` wins.
4. **Specificity.** The highest wins.
5. **Order of appearance.** The last declaration in document order wins.

So source order decides only between rules that have already tied on everything above it. That is
why `.card p { color: teal }` still beats a `p { color: black }` written fifty lines further down:
the two never reached step 5.

Specificity is three counts, not one number: ids, then classes (which includes attribute selectors
and pseudo-classes), then element types and pseudo-elements. MDN writes it `1-0-0`, and the columns
are compared left to right, so `1-0-0` beats `0-4-0` and would beat `0-40-0`. No quantity of classes
ever outranks one id. This is where the habit of adding another class until the rule wins does its
damage: `.page .nav .list .item.active` wins today, the next override is written against that
selector rather than against the element, and six months later half a dozen selectors match the
element and none of them says what it is for. Winning by weight is a debt, and the interest is paid
by whoever next has to change the colour.

`!important` does not raise a rule's specificity. It moves the declaration into a different bucket
at step 1, above every normal author declaration, which is why nothing in ordinary CSS can beat it
and the next override has to be `!important` too. Inside that bucket the sequence starts again with
the layer comparison inverted: the first layer wins, and important declarations outside any layer
lose to important declarations inside one. Reaching for it is a signal about the other two steps.
Either the rule belongs in a layer that outranks what it is fighting, or the selector it is fighting
is too specific to be an override in the first place.

Cascade layers are the feature built for this. `@layer` decides before specificity, so a one-class
utility in a later layer beats a three-part component selector in an earlier one, and the order is
declared once at the top of the codebase instead of negotiated per rule. Two things to know before
using them: styles that are not in any layer beat every layer for normal declarations, so a
half-layered stylesheet behaves oddly, and support is Baseline widely available, in browsers since
March 2022 per MDN.

Two other cases look like the cascade and are not. The right rule won; the value means something
other than what you read. `box-sizing` decides what `width` covers: the default `content-box` sizes
the content alone and adds padding and border outside it, while `border-box` makes `width` describe
the border box so padding eats into it. And `em` resolves against the computed font size of the
element it is used on, while `rem` resolves against the root element's font size, so `em` compounds
through nesting and `rem` does not.

## Worked example

Two rules, one element, and the red one is written second:

```css
#sidebar .link {
  color: blue;
} /* 1-1-0 */
.link {
  color: red;
} /* 0-1-0 */
```

Blue wins at step 4, so step 5 never runs. Two ways to make red win, and only one of them scales:

```css
/* Match the weight, then order decides. Cheap, and one more turn of the ratchet. */
#sidebar .link {
  color: red;
}

/* Or take specificity out of the argument. */
@layer base, theme;
@layer base {
  #sidebar .link {
    color: blue;
  }
}
@layer theme {
  .link {
    color: red;
  } /* later layer, so it wins with 0-1-0 */
}
```

Now the same element, sized:

```css
.card {
  width: 300px;
  padding: 20px;
} /* paints 340px wide */
.card {
  box-sizing: border-box;
  width: 300px;
  padding: 20px;
} /* paints 300px, content 260px */
```

And the same declaration on a nested list, with a 16px root:

```css
li {
  font-size: 1.1em;
  padding-left: 1em;
}
/* level 1: font-size 17.6px, padding 17.6px */
/* level 2: font-size 19.36px, padding 19.36px */
/* level 3: font-size 21.296px, padding 21.296px */
```

## Traps

**The more specific rule is the one that lost.** Specificity is step 4, so anything above it has
already decided. Check the element for a `style` attribute, check the winner for `!important`, and
check which layer each rule is in: a `0-1-0` utility in a later layer beating a `1-1-0` component
selector is layers working as designed. If your rule is winning and the element still is not where
you can see it, that is a painting question rather than a cascade one, and belongs to
[stacking and overflow](./stacking-and-overflow.md).

**The element is wider than the width you set.** `width: 300px` with `padding: 20px` paints 340px
under the default `content-box`, and adding a border widens it again. Set
`*, *::before, *::after { box-sizing: border-box }` once at the top of the stylesheet and the
arithmetic stops: padding comes out of the 300 instead of being added to it. It matters most where a
width is a percentage and something else on the row has to fit beside it, which is the failure mode
behind most of [layout without media queries](./layout-without-media-queries.md).

**The padding grows at every level of a nested list.** One declaration, `padding: 1em`, and the
indent gets visibly deeper as you go down. `em` is relative to the element's own computed font size,
so any inherited font-size scaling multiplies through the nesting. Switch the padding to `rem` and
it is the same everywhere while still respecting a user who raised their browser's font size, which
a hardcoded `px` ignores. Keep `em` where compounding is the point: `padding: 0.5em` on a button
scales with the button's own text, which is what you want from a component that ships in three
sizes.

**Nothing in the stylesheet can override the inline style.** Element-attached styles are compared
at step 2, above layers and above specificity, so an id selector loses to a `style` attribute and
always will. The only CSS answer is `!important`, and taking it commits every future override to
`!important` as well. The real fix is upstream: find the JavaScript writing `element.style` and have
it toggle a class instead.
