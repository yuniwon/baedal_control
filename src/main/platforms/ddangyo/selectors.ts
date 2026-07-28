export const ddangyoSelectors = {
  username: '#mf_encrypted_id, #mf_ibx_mbrId',
  password: '#mf_encrypted_pwd, #mf_sct_pwd',
  loginButton: '#mf_btn_webLogin',
  groupList: '#mf_wfm_contents_wfm_tabcontents_gen_menuGrp > li',
  groupLink: '#mf_wfm_contents_wfm_tabcontents_gen_menuGrp > li a',
  groupListBackButton: '#mf_wfm_contents_wfm_tabcontents_btn_menuGrp',
  menuList: '#mf_wfm_contents_wfm_tabcontents_gen_menu > li',
  groupName: '#mf_wfm_contents_wfm_tabcontents_tbx_menuGrpNm',
  menuId: '[id$="_spa_menuId"]',
  menuManageButton: '[id$="_btn_mngMenu"]',
  menuInfoNameInput: '#mf_wfm_contents_wfm_tabcontents_SMWME01T120P40_wframe_ibx_menuNm',
  menuInfoApplyButton: '#mf_wfm_contents_wfm_tabcontents_SMWME01T120P40_wframe_btn_appl'
} as const
