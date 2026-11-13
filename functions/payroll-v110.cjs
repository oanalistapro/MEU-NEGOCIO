
'use strict';

// MEU NEGÓCIO PRO — PAYROLL V110
// Cloud Functions — Node.js 20+
// Instalar: npm install firebase-admin firebase-functions

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

if (!getApps().length) initializeApp();

const db = getFirestore();

const MONEY = [
  'base', 'extra', 'overtime', 'night', 'bonus',
  'deductions', 'inss', 'irrf', 'advances',
  'fgts', 'otherTaxDeduction'
];

const round = n =>
  Math.round((n + Number.EPSILON) * 100) / 100;

function invalid(message) {
  throw new HttpsError('invalid-argument', message);
}

function amount(v, k) {
  const n = Number(v ?? 0);

  if (
    !Number.isFinite(n) ||
    n < 0 ||
    n > 1e8 ||
    Math.abs(Math.round(n * 100) - n * 100) > 1e-6
  ) {
    invalid('Valor inválido em ' + k);
  }

  return round(n);
}

function safeString(v, max = 80) {
  return typeof v === 'string' && v.length <= max ? v : '';
}

exports.savePayrollV45 = onCall(
  {
    region: 'southamerica-east1',
    enforceAppCheck: true,
    maxInstances: 10
  },
  async request => {

    const auth = request.auth;

    if (!auth || auth.token.email_verified !== true) {
      throw new HttpsError(
        'unauthenticated',
        'Entre com e-mail verificado.'
      );
    }

    const { companyId, id, data } = request.data || {};

    if (
      typeof companyId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(companyId) ||
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      invalid('Solicitação inválida.');
    }

    if (
      id !== null &&
      id !== undefined &&
      (
        typeof id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,120}$/.test(id)
      )
    ) {
      invalid('ID inválido.');
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.period || '')) {
      invalid('Competência inválida.');
    }

    if (
      typeof data.employeeId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(data.employeeId)
    ) {
      invalid('Funcionário inválido.');
    }

    if (!['rascunho', 'conferido', 'fechado'].includes(data.status)) {
      invalid('Situação inválida.');
    }

    const amounts = Object.fromEntries(
      MONEY.map(k => [k, amount(data[k], k)])
    );

    const dependents = Number(data.dependents || 0);

    if (
      !Number.isInteger(dependents) ||
      dependents < 0 ||
      dependents > 30
    ) {
      invalid('Dependentes inválidos.');
    }

    const gross = round(
      amounts.base +
      amounts.extra +
      amounts.overtime +
      amounts.night +
      amounts.bonus
    );

    const deductions = round(
      amounts.deductions +
      amounts.inss +
      amounts.irrf +
      amounts.advances
    );

    if (deductions > gross) {
      invalid('Descontos maiores que o bruto.');
    }

    const net = round(gross - deductions);

    const root = db.collection('companies').doc(companyId);
    const members = root.collection('members');
    const payroll = root.collection('payroll');

    const canonicalId =
      'folha_' + data.employeeId + '_' + data.period;

    if (id && id !== canonicalId) {
      // Compatibilidade com folhas antigas.
    }

    const target = id
      ? payroll.doc(id)
      : payroll.doc(canonicalId);

    const roleDoc = members.doc(auth.uid);
    const employeeDoc = root
      .collection('employees')
      .doc(data.employeeId);

    // Verificação de duplicidade de lançamentos.

    if (!id) {
      const existing = await payroll
        .where('employeeId', '==', data.employeeId)
        .where('period', '==', data.period)
        .limit(1)
        .get();

      if (!existing.empty) {
        throw new HttpsError(
          'already-exists',
          'Funcionário já possui folha na competência.'
        );
      }
    }

    await db.runTransaction(async tx => {

      const [
        companySnap,
        memberSnap,
        employeeSnap,
        currentSnap
      ] = await Promise.all([
        tx.get(root),
        tx.get(roleDoc),
        tx.get(employeeDoc),
        tx.get(target)
      ]);

      if (
        !companySnap.exists ||
        !memberSnap.exists ||
        companySnap.get('ownerUid') === undefined ||
        !['owner', 'admin'].includes(memberSnap.get('role')) ||
        !Array.isArray(companySnap.get('memberUids')) ||
        !companySnap.get('memberUids').includes(auth.uid)
      ) {
        throw new HttpsError(
          'permission-denied',
          'Acesso administrativo não autorizado.'
        );
      }

      if (!employeeSnap.exists) {
        invalid('Funcionário não encontrado.');
      }

      if (
        memberSnap.get('role') === 'owner' &&
        companySnap.get('ownerUid') !== auth.uid
      ) {
        throw new HttpsError(
          'permission-denied',
          'Proprietário inválido.'
        );
      }

      const prev = currentSnap.exists
        ? currentSnap.data()
        : null;

      if (id && !prev) {
        throw new HttpsError(
          'not-found',
          'Folha não encontrada.'
        );
      }

      if (!id && prev) {
        throw new HttpsError(
          'already-exists',
          'Folha já cadastrada nesta competência.'
        );
      }

      if (
        prev &&
        prev.status === 'fechado'
      ) {
        throw new HttpsError(
          'failed-precondition',
          'Folha fechada é imutável.'
        );
      }

      if (
        prev &&
        (
          prev.employeeId !== data.employeeId ||
          prev.period !== data.period
        )
      ) {
        throw new HttpsError(
          'failed-precondition',
          'Não altere funcionário ou competência de um lançamento existente.'
        );
      }

      const from = prev?.status || null;
      const to = data.status;

      if (
        (!prev && to !== 'rascunho') ||
        (
          from === 'rascunho' &&
          !['rascunho', 'conferido'].includes(to)
        ) ||
        (
          from === 'conferido' &&
          !['conferido', 'fechado'].includes(to)
        )
      ) {
        throw new HttpsError(
          'failed-precondition',
          'Transição de situação inválida.'
        );
      }

      const next = {
        employeeId: data.employeeId,
        period: data.period,
        status: to,
        ...amounts,
        dependents,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid
      };

      if (!prev) {
        next.createdAt = FieldValue.serverTimestamp();
        next.createdBy = auth.uid;
      }

      if (
        to === 'conferido' &&
        from !== 'conferido'
      ) {
        next.reviewedAt = FieldValue.serverTimestamp();
        next.reviewedBy = auth.uid;
      }

      if (to === 'fechado') {
        throw new HttpsError(
          'failed-precondition',
          'Fechamento oficial indisponível: incidências e cálculos precisam ser homologados no servidor.'
        );
      }

      tx.set(target, next, {
        merge: !!prev
      });

      tx.create(
        root.collection('payrollAudit').doc(),
        {
          type:
            to === 'fechado'
              ? 'payroll_closed'
              : to === 'conferido' &&
                from !== 'conferido'
                ? 'payroll_reviewed'
                : prev
                  ? 'payroll_updated'
                  : 'payroll_created',
          docId: target.id,
          actorUid: auth.uid,
          at: FieldValue.serverTimestamp(),
          source: 'savePayrollV45',
          previousStatus: from || '',
          newStatus: to
        }
      );
    });

    return {
      ok: true,
      id: target.id,
      status: data.status
    };
  }
);
