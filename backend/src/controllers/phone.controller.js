// App-facing phone endpoints. The service comes from app.locals so tests can
// mount these routes over a lifecycle backed by an in-memory db.

import { OUTCOME } from '../utils/phone.js';

const service = (req) => {
  const s = req.app.locals.phoneService;
  if (!s) {
    const err = new Error('Phone service is not wired');
    err.status = 503;
    throw err;
  }
  return s;
};

export function phoneConfig(req, res) {
  res.json(service(req).status());
}

export async function phoneDial(req, res, next) {
  try {
    const { to, productKey = 'devpulse', customerName = null } = req.body || {};
    res.json({ call: await service(req).dial({ to, productKey, customerName }) });
  } catch (err) {
    next(err);
  }
}

export function phoneCalls(req, res) {
  const activeOnly = req.query.active === '1' || req.query.active === 'true';
  res.json({ calls: service(req).attempts({ activeOnly }), outcomes: Object.values(OUTCOME) });
}

export function phoneCall(req, res, next) {
  try {
    res.json({ call: service(req).attempt(req.params.callSid) });
  } catch (err) {
    next(err);
  }
}

export async function phoneCallRefresh(req, res, next) {
  try {
    res.json({ call: await service(req).refresh(req.params.callSid) });
  } catch (err) {
    next(err);
  }
}

export async function phoneCallHangup(req, res, next) {
  try {
    res.json({ call: await service(req).hangup(req.params.callSid) });
  } catch (err) {
    next(err);
  }
}
