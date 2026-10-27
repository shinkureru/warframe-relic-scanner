/**
 * 遊戲裡的繁中名稱與 Warframe.market 可能不同。
 * 這裡僅存「例外」；其餘所有可交易品名稱由市場 API 自動建立本地字典。
 */
export const ADDITIONAL_ALIASES = {
  cedo_prime_blueprint: ['席多 Prime 藍圖'],
  okina_prime_blueprint: ['翁 Prime 藍圖'],
};

// Untradeable relic rewards are not returned by the trade-only /v2/items list.
export const NON_TRADABLE_REWARDS = [
  { re: /(?:2\s*[x×]|雙倍|雙重).*?(?:forma|福馬).*?(?:藍圖|設計圖)?/i, name: '2× Forma 藍圖' },
  { re: /(?:forma|福馬).*?(?:藍圖|設計圖)?/i, name: 'Forma 藍圖' },
];

// Extra real-game translations that may differ from the public Market locale.
ADDITIONAL_ALIASES.cedo_prime_blueprint = ['席多 Prime 藍圖','席多Prime藍圖'];
ADDITIONAL_ALIASES.fang_prime_blade = ['闇牙 Prime 刀刃'];
ADDITIONAL_ALIASES.vectis_prime_receiver = ['守望者 Prime 接收器'];
ADDITIONAL_ALIASES.paris_prime_lower_limb = ['帕里斯 Prime 下弓臂'];
