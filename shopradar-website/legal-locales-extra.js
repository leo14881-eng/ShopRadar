/**
 * 法律页扩展语言（在 legal-locales.js 之后加载）
 */
(function (global) {
  'use strict';

  var legalLocales = global.SHOPRADAR_LEGAL_LOCALES;
  if (!legalLocales || !legalLocales.en) {
    return;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function deepMerge(target, src) {
    if (!src) {
      return target;
    }
    Object.keys(src).forEach(function (key) {
      if (
        src[key] &&
        typeof src[key] === 'object' &&
        !Array.isArray(src[key])
      ) {
        target[key] = target[key] && typeof target[key] === 'object' ? target[key] : {};
        deepMerge(target[key], src[key]);
      } else {
        target[key] = src[key];
      }
    });
    return target;
  }

  function legalFromEn(overrides) {
    return { legal: deepMerge(clone(legalLocales.en.legal), overrides) };
  }

  function legalFromZh(overrides) {
    var base = legalLocales.zh ? clone(legalLocales.zh.legal) : clone(legalLocales.en.legal);
    return { legal: deepMerge(base, overrides) };
  }

  legalLocales.es = legalFromEn({
    backLink: '← Volver a ShopRadar',
    privacy: {
      pageTitle: 'Política de privacidad — ShopRadar',
      heading: 'Política de privacidad',
      updated: 'Última actualización: 21 may 2026',
      hCollect: 'Datos que recopilamos',
      hUse: 'Cómo usamos los datos',
      hStorage: 'Almacenamiento',
      hThird: 'Terceros',
      hContact: 'Contacto',
      hChanges: 'Cambios',
    },
    terms: {
      pageTitle: 'Términos de servicio — ShopRadar',
      heading: 'Términos de servicio',
      updated: 'Última actualización: 21 may 2026',
      hService: 'Descripción del servicio',
      hAccounts: 'Cuentas y suscripciones',
      hAcceptable: 'Uso aceptable',
      hDisclaimer: 'Descargo de responsabilidad',
      hLiability: 'Limitación de responsabilidad',
      hTermination: 'Terminación',
      hContact: 'Contacto',
    },
  });

  legalLocales.ja = legalFromEn({
    backLink: '← ShopRadar に戻る',
    privacy: {
      pageTitle: 'プライバシーポリシー — ShopRadar',
      heading: 'プライバシーポリシー',
      updated: '最終更新: 2026年5月21日',
      hCollect: '収集するデータ',
      hUse: 'データの利用',
      hStorage: 'データの保存',
      hThird: '第三者',
      hContact: 'お問い合わせ',
      hChanges: '変更',
    },
    terms: {
      pageTitle: '利用規約 — ShopRadar',
      heading: '利用規約',
      updated: '最終更新: 2026年5月21日',
      hService: 'サービス内容',
      hAccounts: 'アカウントとサブスクリプション',
      hAcceptable: '許容される利用',
      hDisclaimer: '免責事項',
      hLiability: '責任の制限',
      hTermination: '終了',
      hContact: 'お問い合わせ',
    },
  });

  legalLocales.ko = legalFromEn({
    backLink: '← ShopRadar로 돌아가기',
    privacy: {
      pageTitle: '개인정보 처리방침 — ShopRadar',
      heading: '개인정보 처리방침',
      updated: '최종 업데이트: 2026년 5월 21일',
      hCollect: '수집하는 데이터',
      hUse: '데이터 사용',
      hStorage: '데이터 저장',
      hThird: '제3자',
      hContact: '문의',
      hChanges: '변경',
    },
    terms: {
      pageTitle: '서비스 약관 — ShopRadar',
      heading: '서비스 약관',
      updated: '최종 업데이트: 2026년 5월 21일',
      hService: '서비스 설명',
      hAccounts: '계정 및 구독',
      hAcceptable: '허용되는 사용',
      hDisclaimer: '면책 조항',
      hLiability: '책임 제한',
      hTermination: '종료',
      hContact: '문의',
    },
  });

  legalLocales.pt_BR = legalFromEn({
    backLink: '← Voltar ao ShopRadar',
    privacy: {
      pageTitle: 'Política de privacidade — ShopRadar',
      heading: 'Política de privacidade',
      updated: 'Última atualização: 21 de maio de 2026',
      hCollect: 'Dados que coletamos',
      hUse: 'Como usamos os dados',
      hStorage: 'Armazenamento',
      hThird: 'Terceiros',
      hContact: 'Contato',
      hChanges: 'Alterações',
    },
    terms: {
      pageTitle: 'Termos de serviço — ShopRadar',
      heading: 'Termos de serviço',
      updated: 'Última atualização: 21 de maio de 2026',
      hService: 'Descrição do serviço',
      hAccounts: 'Contas e assinaturas',
      hAcceptable: 'Uso aceitável',
      hDisclaimer: 'Isenção de responsabilidade',
      hLiability: 'Limitação de responsabilidade',
      hTermination: 'Rescisão',
      hContact: 'Contato',
    },
  });

  legalLocales.zh_TW = legalFromZh({
    backLink: '← 返回 ShopRadar',
    privacy: {
      pageTitle: '隱私政策 — ShopRadar',
      heading: '隱私政策',
      updated: '最後更新：2026 年 5 月 21 日',
      hCollect: '我們收集的資料',
      hUse: '資料用途',
      hStorage: '資料儲存',
      hThird: '第三方',
      hContact: '聯絡我們',
      hChanges: '變更',
    },
    terms: {
      pageTitle: '服務條款 — ShopRadar',
      heading: '服務條款',
      updated: '最後更新：2026 年 5 月 21 日',
      hService: '服務說明',
      hAccounts: '帳戶與訂閱',
      hAcceptable: '可接受的使用',
      hDisclaimer: '免責聲明',
      hLiability: '責任限制',
      hTermination: '終止',
      hContact: '聯絡我們',
    },
  });
})(typeof window !== 'undefined' ? window : global);
