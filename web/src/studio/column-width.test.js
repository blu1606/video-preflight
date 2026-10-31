import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clampRightWidth, defaultRightWidth, parseStoredWidth, rightWidthBounds, RIGHT_MIN } from './column-width.js'

test('default width is 30% of the viewport, kept between 420 and 600 px', () => {
  assert.equal(defaultRightWidth(1440), 432)
  assert.equal(defaultRightWidth(1920), 576)
  assert.equal(defaultRightWidth(1000), 420)
  assert.equal(defaultRightWidth(2560), 600)
})

test('bounds: at least 400 px, at most half the viewport and what the phone stage keeps', () => {
  assert.deepEqual(rightWidthBounds(1440, 320), { min: RIGHT_MIN, max: 640 })
  assert.deepEqual(rightWidthBounds(1920, 52), { min: RIGHT_MIN, max: 960 })
  assert.deepEqual(rightWidthBounds(1000, 320), { min: RIGHT_MIN, max: 400 })
})

test('a width outside the bounds is clamped to them', () => {
  assert.equal(clampRightWidth(900, 1440, 320), 640)
  assert.equal(clampRightWidth(100, 1440, 320), RIGHT_MIN)
  assert.equal(clampRightWidth(632, 1440, 320), 632) // 200 px dragged left from the default
})

test('a stored width is read only when it is a positive number', () => {
  assert.equal(parseStoredWidth('512'), 512)
  assert.equal(parseStoredWidth(null), null)
  assert.equal(parseStoredWidth('abc'), null)
  assert.equal(parseStoredWidth('-4'), null)
  assert.equal(parseStoredWidth(''), null)
})
