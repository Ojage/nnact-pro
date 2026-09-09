import assert from "node:assert/strict";
import test from "node:test";
import {
  cameroonCarrier,
  cameroonCarrierLabel,
  isValidCameroonMobile,
  normalizePhone,
} from "../src/phone.ts";

test("normalizePhone stems and prefixes Cameroon numbers", () => {
  assert.equal(normalizePhone("6 70 12 34 56"), "237670123456");
  assert.equal(normalizePhone("+237 670123456"), "237670123456");
  assert.equal(normalizePhone("670123456"), "237670123456");
  assert.equal(normalizePhone("00237 670123456"), "237670123456");
});

test("isValidCameroonMobile accepts MTN/Orange/Camtel", () => {
  assert.equal(isValidCameroonMobile("670123456"), true);
  assert.equal(isValidCameroonMobile("237 690123456"), true);
  assert.equal(isValidCameroonMobile("620123456"), true);
  assert.equal(isValidCameroonMobile("683123456"), true);
});

test("isValidCameroonMobile rejects landlines and short numbers", () => {
  assert.equal(isValidCameroonMobile("22123456"), false);
  assert.equal(isValidCameroonMobile("12345"), false);
  assert.equal(isValidCameroonMobile(""), false);
  assert.equal(isValidCameroonMobile("237 610123456"), false);
});

test("cameroonCarrier classifies by prefix", () => {
  assert.equal(cameroonCarrier("670123456"), "mtn");
  assert.equal(cameroonCarrier("683123456"), "mtn");
  assert.equal(cameroonCarrier("690123456"), "orange");
  assert.equal(cameroonCarrier("662123456"), "orange");
  assert.equal(cameroonCarrier("620123456"), "camtel");
  assert.equal(cameroonCarrier("630123456"), "camtel");
  assert.equal(cameroonCarrier("22123456"), null);
});

test("cameroonCarrierLabel reads well", () => {
  assert.equal(cameroonCarrierLabel("670123456"), "MTN Cameroon");
  assert.equal(cameroonCarrierLabel("690123456"), "Orange Cameroon");
  assert.equal(cameroonCarrierLabel("620123456"), "Camtel");
});