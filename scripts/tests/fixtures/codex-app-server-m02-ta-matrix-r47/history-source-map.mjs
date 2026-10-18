/** Exact accepted-source and additive-clone provenance. Source identity is historical; this map grants no runtime authority. */
export const HISTORY_SOURCE_MAP = Object.freeze(
  [
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r46/r44-evidence.mjs',
      sourceSha256: '3bd775c18d3f1e434cfed109b534731f059eb0a9634d797b657febd66b1eea41',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/r44-evidence.mjs',
      cloneSha256: '484d5978f8e789e70f89144f7d668f30a0fff62703ad13b2af9eb823617a958b',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'countsValid',
          sha256: '53c77b7474bbf6525f9663a806dc99b85b9c47de2fa3400984e55b773d326b71',
        },
        {
          name: 'expectedNames',
          sha256: '8e7ded5ee6f0df446c8a5ee1c5e313609852c2a70d8a1f27867a2b76694b5528',
        },
        {
          name: 'verifyCase',
          sha256: '90841701b8597f689deba1ada9be91c37453e3fa61a5a61464f05e296cec3ae8',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'OLD_ROOT',
          sha256: '722732700b1ca6fa119d79c7a3148ac0d8f7a81d6a1672e1ab2eaf6513d12b48',
        },
        {
          name: 'MANIFEST',
          sha256: 'c6c70775ab2343ddabebc5747b391e9e4291c15a9d18b4842ec2f544d72a1bb7',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: 'e7ff12fd77af3ffa5d658b600db58c93bf5254a2ccf8ff29adde161f604e3481',
        },
        {
          name: 'MANIFEST_DIGEST',
          sha256: '698acf208f2e71af7cb2da848b07f1f7ca1ba412b67dcac9b6be0b5f1c79ebd8',
        },
        {
          name: 'TERMINAL',
          sha256: '0fe7fb79bf984472218a60bd6c1b87fe2590c692c941be3e850b092d0d57cccd',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: '4ea1914c8b9ea2c1fc15364e0731217272a6b654313ce08fa1c27793d3f1d3df',
        },
        {
          name: 'INDEX',
          sha256: 'f4d8ac7d3782324d516bca282046755337f2e09fd5c894be9e676cbed8033eb7',
        },
        {
          name: 'INDEX_SHA',
          sha256: 'b2f3084820f26773182ecb3098e3ddb7bc7a1bc6168914ff34ec9e64c497513d',
        },
        {
          name: 'CASES',
          sha256: '5cf7613ddc45355c8d59194e9253042d36b2aa6a4eaa81d1c21800eb86b5ba06',
        },
        {
          name: 'COMPLETED_CASES',
          sha256: '579607f2c722370bdbb428f8ea4bcf2a0599bf986720a665895d44e9340ea9e5',
        },
        {
          name: 'R44_COUNTS',
          sha256: 'fce54969c38c42dab077a01c03bc9c34603c651c563878ee8acf06c5ea9473be',
        },
        {
          name: 'WITNESS_PINS',
          sha256: 'd3672becd72d8dac93baad881845ea959cdd7e7ef8f336496c8a7fcec4d87d0c',
        },
        {
          name: 'SHA256',
          sha256: '08a5785ec644df65498a1026870a3d013c34dcfd0b82c6ff25a0f4f42cbb506e',
        },
        {
          name: 'KINDS',
          sha256: '070a66b067b3deb6d11f9b1f24a9c639f302c42a90f1ca5175a5dc8bbc7bbd63',
        },
        {
          name: 'same',
          sha256: 'd93b23c4d5f1f8aaeaf97b4b436412ad251b36e36075b8d6ebb00365b97830cc',
        },
        {
          name: 'sha',
          sha256: '4715026b19f767e35e11ac89248faa6fa3fd13362bf8f23a471f9eb7f1705439',
        },
        {
          name: 'privateDirectory',
          sha256: 'c34da72cb91763f837191ec9e7f84f33f32ad2d7d19656d735482e634692950e',
        },
        {
          name: 'nonnegative',
          sha256: '793ff7fa6899243c565b48c28ad1710339c0a94f65d62cc4707637f23de0636d',
        },
        {
          name: 'consistentOwnedExit',
          sha256: '577882a1560a20a3de03c895fde2644ec7e8d034857d58eb7713b639b844b707',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: '4c2a80e95cb783da8b92fe74e1d5c4448c06069fe574368476b661f5534990dc',
        },
        {
          name: 'FOCUSED_VERDICT',
          sha256: '265a475056ff9d41931ef81b90d743a05805432d6d87a965e7fac3c65640ee6b',
        },
        {
          name: 'FIXED_COMMAND',
          sha256: 'ad490a0be6d1e728cb90edabb37dd1909e64ba8a7f7ffbac0a312b011a3bb550',
        },
      ],
      changedFunctions: ['readPrepared', 'verifyAuthority', 'verifyJournal', 'verifyR44Predecessor'],
      semanticCorrections: [
        {
          function: 'verifyJournal',
          originalPredicate: "records.at(-1).event.caseId !== 'B04'",
          replacementPredicate: "[...finished.keys()].at(-1) !== 'B04'",
          reason:
            'Pinned finish events omit caseId; the finished Map keys derive only from strictly correlated active cases and witnesses.',
          journalSha256: '988181443a3d2b3df8171da27c5112c1bd25a2ed18a9e2b92029d9e79de5d382',
          terminalSha256: '286249ba8b8921baa833a0b1885373d78714095d351fbd3983c99480a8909a84',
          indexSha256: '5621aa1803ff639de9b4ae46cdd63e3ebfdb8e5080cf6446bddabf398c279c0d',
        },
      ],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r44/r43-evidence.mjs',
      sourceSha256: 'a6894caf02efab806ca5abdca653829fd24f663111c3101a8a0d4640f75e27ff',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r43-evidence.mjs',
      cloneSha256: '83e026beef136d0b8cd7b62babbf3e7dcf6a19545711c392e11fbe99b511fdce',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'countsValid',
          sha256: '53c77b7474bbf6525f9663a806dc99b85b9c47de2fa3400984e55b773d326b71',
        },
        {
          name: 'verifyJournal',
          sha256: 'e73db67e0fefbdd124308ee6a869ab6f0c7b2e0e75b34db2bfcba29c7d93d653',
        },
        {
          name: 'expectedNames',
          sha256: '08de8d8701d68038302742f458f46c216cf33ce085a1f19c75b72dba75250394',
        },
        {
          name: 'verifyCompletedWitness',
          sha256: '54fd20f37183c88d259ea0f7180eea3fd23099cb8abf087ffda0bd64080c2818',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'OLD_ROOT',
          sha256: '67d0db1200e8074dfdbda1b22d0cea1b4714c059e34bd6816e462eab32ef4165',
        },
        {
          name: 'MANIFEST',
          sha256: 'd49fb74da2346839d69ac6cd4184f6d842a5b93f64f01906f2eda75e7246b0b3',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: '2ef194702ac659a3a405da79fea0c4a7de188127fbc3ecd1dc06e55af952807b',
        },
        {
          name: 'MANIFEST_DIGEST',
          sha256: 'c72b4467b8a49b404745ecd2b079fb8102806344f43c1cc7f34b402d3a987837',
        },
        {
          name: 'TERMINAL',
          sha256: 'dcb52d1428ac92bb04517b0ec7acf8a7a82a3e5a6b77626f88423714265a3dbb',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: '9855b89b8553a6b5bc5158d6c82f73724505b5e81e4f71a86525273346fcab1f',
        },
        {
          name: 'INDEX',
          sha256: '9bee709256f3f13f51c06c88117a0ea9bafabbb7c89e256d341fa71a3f4afcdc',
        },
        {
          name: 'INDEX_SHA',
          sha256: 'cefc0d8aef64f3971b5037cf9239910cc28ec4d211388ede5afa498c74d24545',
        },
        {
          name: 'CASES',
          sha256: 'c44e2a37ecf8c5c4f257be48fc01ae89cc2f12803b27909188e302e6c500eb78',
        },
        {
          name: 'R43_COUNTS',
          sha256: '6ec9b994bff02de308bd38f9a4d6f834dba8500ca6b268dd02f586634ffcf14b',
        },
        {
          name: 'SHA256',
          sha256: '08a5785ec644df65498a1026870a3d013c34dcfd0b82c6ff25a0f4f42cbb506e',
        },
        {
          name: 'KINDS',
          sha256: 'c75defc958fbfa47beb699bb25935fa520497c76e32c10b34ab533a2d58f0d8f',
        },
        {
          name: 'same',
          sha256: 'd93b23c4d5f1f8aaeaf97b4b436412ad251b36e36075b8d6ebb00365b97830cc',
        },
        {
          name: 'sha',
          sha256: '4715026b19f767e35e11ac89248faa6fa3fd13362bf8f23a471f9eb7f1705439',
        },
        {
          name: 'fail',
          sha256: '34be05a81fa45d817e1f5446f033aaecb42c6faea86838bf518072b589620485',
        },
        {
          name: 'privateDirectory',
          sha256: 'c34da72cb91763f837191ec9e7f84f33f32ad2d7d19656d735482e634692950e',
        },
        {
          name: 'nonnegative',
          sha256: '793ff7fa6899243c565b48c28ad1710339c0a94f65d62cc4707637f23de0636d',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: '63f36f6298fa1843f21ea49d7563ca3c05839fb14cebda9f288630a42617433c',
        },
        {
          name: 'FIXED_COMMAND',
          sha256: '50760dfc1da6eb9644485bda8a891d9d08ed189866e1be4d92f04e41f9837b76',
        },
        {
          name: 'WITNESS',
          sha256: '93b1c4de38a16d8fba81e8f7ff0a8e9bdc26f53b344645f207eb127cc724e8ba',
        },
        {
          name: 'GIT_READINESS',
          sha256: 'e6d91d74c4628dc4a68efd0cf7907bde6a4cf31146f3a13ef1267e226e65076f',
        },
        {
          name: 'ENVIRONMENT_PROFILE',
          sha256: '7a496ad5cfeadb01860d5a5b04324b5dfa51cbe55ee1e5be33daf4cc0074d508',
        },
        {
          name: 'STATE_OBSERVATIONS',
          sha256: 'fde7d1894e46b939d5bfdb3380ef375d2aa9a15974e5b232db9f3765f06898b8',
        },
        {
          name: 'CHILD_PATH_OBSERVATIONS',
          sha256: 'a36325503f51f15669bdab9469f20f49ac8706cd774748053cdcff82d5543c31',
        },
      ],
      changedFunctions: ['readPrepared', 'verifyAuthority', 'verifyR43Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r43/r41-evidence.mjs',
      sourceSha256: '522715949276a41d53933e6ca5a931af3b1ff41baa9dfdc73b67625561659a2f',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r41-evidence.mjs',
      cloneSha256: 'f75c7238e986c065f23d6ec4878c94309e6a336faf2c7e610c130a05cd5689c5',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'countsValid',
          sha256: '53c77b7474bbf6525f9663a806dc99b85b9c47de2fa3400984e55b773d326b71',
        },
        {
          name: 'verifyJournal',
          sha256: '89e5361d6b2802b00f2d09ccffa76638e4577e397faac23a834d33e72eaa21a6',
        },
        {
          name: 'expectedNames',
          sha256: '19cf287d30fdb11a2864144288cbcb8b3a57676a46dcb3dee3d27a02cde22993',
        },
        {
          name: 'verifyCase',
          sha256: 'bbfd44f477c1ac25593ff9e7b7a7855d55213b91ea3505425255a8cfa259d3a7',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'OLD_ROOT',
          sha256: '9e46bc062b1842b8f91314ba8cae7ffba11310c1e4915b175e621aaf7427164a',
        },
        {
          name: 'MANIFEST',
          sha256: 'a00f6a1af0cf4d196c8e8d4aeecd1b4e070a23ff24d76d96ddbcf3974b7a0600',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: 'a4c3610d61f58f2833f10c1408cc16094bf5cabec391fccb5da2a36d71d522cc',
        },
        {
          name: 'MANIFEST_DIGEST',
          sha256: '903058cd53591fb9805c6f9097cb5654cde9be403582455f537b188eaa320a56',
        },
        {
          name: 'TERMINAL',
          sha256: 'c2a892460626f0404f758908cb3bf1d5c839779cff62afe372f7f0e10715ba7a',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: 'c67d5e4637c9bcc327928bb7f5eef960f3042baf5173ace1b52f5c653b8d4853',
        },
        {
          name: 'INDEX',
          sha256: 'e827e283adffa6e08ebaf880672b6bcb6bd6af734b773d754d5d307dcb801f2c',
        },
        {
          name: 'INDEX_SHA',
          sha256: '777737ca898224739d165c1a4619f93d0b72f41663da9daf6ef20d632281e3d0',
        },
        {
          name: 'CASES',
          sha256: '948a2a9aa64defd9fccc1bb9cc094b2e61325d3091db5d07c33dc65c3553cfb8',
        },
        {
          name: 'R41_COUNTS',
          sha256: '33a35ff791be2a505dd81aa3f102b8c6b0727c8ffc121682f414afb5ca5aa72c',
        },
        {
          name: 'WITNESS_PINS',
          sha256: 'aa0a40985611827495960d1b23e64208b0ef164e30fa956b959fa834dfbf73e2',
        },
        {
          name: 'FAILED_DIAGNOSTIC',
          sha256: '7afb36517f15b53924b03057f9b519f288f7522cbb3077d2f5f233f53b06a619',
        },
        {
          name: 'SHA256',
          sha256: '08a5785ec644df65498a1026870a3d013c34dcfd0b82c6ff25a0f4f42cbb506e',
        },
        {
          name: 'KINDS',
          sha256: 'b738374f35a7e5e84898226b8546acd8a41f2f3fae63b7eee660175e4dd3da10',
        },
        {
          name: 'same',
          sha256: 'd93b23c4d5f1f8aaeaf97b4b436412ad251b36e36075b8d6ebb00365b97830cc',
        },
        {
          name: 'sha',
          sha256: '4715026b19f767e35e11ac89248faa6fa3fd13362bf8f23a471f9eb7f1705439',
        },
        {
          name: 'fail',
          sha256: 'a57374be07add30973f23376d33ac808ecd2181b4fe3f11657be17659e6fd7b0',
        },
        {
          name: 'privateDirectory',
          sha256: 'c34da72cb91763f837191ec9e7f84f33f32ad2d7d19656d735482e634692950e',
        },
        {
          name: 'nonnegative',
          sha256: '793ff7fa6899243c565b48c28ad1710339c0a94f65d62cc4707637f23de0636d',
        },
        {
          name: 'consistentOwnedExit',
          sha256: '577882a1560a20a3de03c895fde2644ec7e8d034857d58eb7713b639b844b707',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: '45b00a993c3bcee9c199bda13992368f2fe2f38c12b29c7621fca9c5b7a4cd95',
        },
        {
          name: 'FIXED_COMMAND',
          sha256: '777a94e75d950b90dd60ca661c9edc411427f49880108cf32ff446066189ef37',
        },
      ],
      changedFunctions: ['readPrepared', 'verifyAuthority', 'verifyR41Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r41/r37-evidence.mjs',
      sourceSha256: '460d49653f9a90a4f3489aef60ea5695e1e50ba0428b48c757762a9f345434e3',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r37-evidence.mjs',
      cloneSha256: '45c34088b2732e57462c2b806b2d6dae25fc8cb6609badb4c9bb1def0902653e',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'countsValid',
          sha256: '53c77b7474bbf6525f9663a806dc99b85b9c47de2fa3400984e55b773d326b71',
        },
        {
          name: 'verifyJournal',
          sha256: '6d066fc95f5b4410b62b881409afe09bf11a5ed6d9e837d5d9b135ad84317bc2',
        },
        {
          name: 'expectedNames',
          sha256: 'e9643757e0e9fc6571756425fb653cb41b1c850a2b6e27eb6c9428fd8b92a0e9',
        },
        {
          name: 'verifyCase',
          sha256: '074675c2a62082e510d457e1287cfb66e0424a3527565f1101e52ee832154dce',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'OLD_ROOT',
          sha256: '493869373eb687cd192921c5778e7c93de9e6d3d8cf8356bce03dd6efc69895d',
        },
        {
          name: 'MANIFEST',
          sha256: '75b6779486d7f5429fd89dd6d5881ff3d0f337b14227b7f0dfb6dd71f32d78ae',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: 'f07451fa2047cf91a66faa373a89db93888b013bf8cda49cecb3b7251efbf5c2',
        },
        {
          name: 'MANIFEST_DIGEST',
          sha256: 'd073a213c3a2e0649d5b3088d25895de4d6e5f675bd95ce32f1e1965e474d293',
        },
        {
          name: 'TERMINAL',
          sha256: '55a7d5bba19d591e478858e2b17b82e3ebced7f188a16d21c579f659a3ea7642',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: 'cc86b44f3ad4e2a6b2b5dc57105e2152699a514f6ad11dd2c57bfb67bf7693c0',
        },
        {
          name: 'INDEX',
          sha256: '65fef7d62139ff43c8edbc8a6ea6f9b22054241ce2f24079dd8447062e3dce08',
        },
        {
          name: 'INDEX_SHA',
          sha256: '39c83cdedcdf2ecf9865a34f66e3c9ec1498fdae32d2622064ffc42b659e9ecc',
        },
        {
          name: 'CASES',
          sha256: '281060c97c38c60b9c5e80a02d922d3bbbed1aa87563ed33a04ae5699bd96cbb',
        },
        {
          name: 'R37_COUNTS',
          sha256: '3a4dbb4d8f06964ee8fb061853cf60af3adc62740eb3e407833a1f9fb37dcaea',
        },
        {
          name: 'WITNESS_PINS',
          sha256: '09275f4ad0f39e3bb470ac77d561b6c7f84a9b367b6af749a74bb73ecaf77ef3',
        },
        {
          name: 'FAILED_DIAGNOSTIC',
          sha256: 'a0a825ad133c5fba488aa17137192d773e4161e832b10d4f5ce4673319f991a3',
        },
        {
          name: 'SHA256',
          sha256: '08a5785ec644df65498a1026870a3d013c34dcfd0b82c6ff25a0f4f42cbb506e',
        },
        {
          name: 'KINDS',
          sha256: 'c4ca91fa620273d4f1995d764080b2c0b19fda812a730b8a03b35741b3f384b9',
        },
        {
          name: 'same',
          sha256: 'd93b23c4d5f1f8aaeaf97b4b436412ad251b36e36075b8d6ebb00365b97830cc',
        },
        {
          name: 'sha',
          sha256: '4715026b19f767e35e11ac89248faa6fa3fd13362bf8f23a471f9eb7f1705439',
        },
        {
          name: 'fail',
          sha256: '76468203eacc417f32aec847f2f2f6eadfea2de6cb05999f1699c56add3599b1',
        },
        {
          name: 'privateDirectory',
          sha256: 'c34da72cb91763f837191ec9e7f84f33f32ad2d7d19656d735482e634692950e',
        },
        {
          name: 'nonnegative',
          sha256: '793ff7fa6899243c565b48c28ad1710339c0a94f65d62cc4707637f23de0636d',
        },
        {
          name: 'consistentOwnedExit',
          sha256: '577882a1560a20a3de03c895fde2644ec7e8d034857d58eb7713b639b844b707',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: '73ad4f6af4722c82bd0af47cb5215969d2f95b33de0e6f611fe73573e9bc503a',
        },
        {
          name: 'FIXED_COMMAND',
          sha256: '2842879e198a1434ca26a6cf28f9bceaf4de79e1162781f85fa85196633ecc6e',
        },
      ],
      changedFunctions: ['readPrepared', 'verifyAuthority', 'verifyR37Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r37/r36-evidence.mjs',
      sourceSha256: 'ae60a2afaa035bda840e0d6d32b65021727197963d32d118c780f03a75011760',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r36-evidence.mjs',
      cloneSha256: 'c0ca2dfe51881c697803b52b08b393b1d736e3949e56606765f350f43117cb14',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'countsValid',
          sha256: '53c77b7474bbf6525f9663a806dc99b85b9c47de2fa3400984e55b773d326b71',
        },
        {
          name: 'verifyJournal',
          sha256: '61c0bc9a299939d8f0b79d10d591c3c0f07c873340f2eb48d1fcc64d2c203748',
        },
        {
          name: 'expectedNames',
          sha256: '00256116da93ace59e713ac69c7b895fbbe0517a035e29f1759f7e208c22942b',
        },
        {
          name: 'verifyCompletedWitness',
          sha256: '4e50dc731ad1cc770337fd1556d922fd97a99b98459dc1c68fe286615f872ea4',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'OLD_ROOT',
          sha256: 'f2441e5bbe99bf49678fb8e43751fffa4cc4823cdfab1a9f628b1ec76334d0bc',
        },
        {
          name: 'MANIFEST',
          sha256: '9d8f6df9785bf1263500a387f929a40cbeba98048dae1fe66387f2fef2622dcb',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: '303ebb98feedbe04db16d1d2aeac2c681b19f2700d12ad56a351f83085f5d551',
        },
        {
          name: 'MANIFEST_DIGEST',
          sha256: '4cfe4e5050774ffac6a37905be164fdd722c8ac16f0a8e398cd2bfbe6ac12172',
        },
        {
          name: 'TERMINAL',
          sha256: '771414bfeec97198605c309f4ab77b12073cf5873537e79ac7952c338dcc8579',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: '378afbb5c0a957f78ff53a4181cfe307864ef24a9a04557ca1300032551bb39a',
        },
        {
          name: 'INDEX',
          sha256: '1920a673a6fef7b5e157083596c524d3dc88fbf769d991e0225ee47e4649bab1',
        },
        {
          name: 'INDEX_SHA',
          sha256: '2cc189ce231816dc0537e6debe725616a11797e3dc1f55b4b91471b9df2c05c4',
        },
        {
          name: 'CASES',
          sha256: 'cbf89349a7fa76f6ad27a9b4b04e25a9e99066728c425168f8fc636f2f3c1ac8',
        },
        {
          name: 'R36_COUNTS',
          sha256: 'dafcfc46db1b2eb79310c4a503757062c886e177a6711933401e5b59e726f1d5',
        },
        {
          name: 'SHA256',
          sha256: '08a5785ec644df65498a1026870a3d013c34dcfd0b82c6ff25a0f4f42cbb506e',
        },
        {
          name: 'KINDS',
          sha256: '4de3741779f8064273054fb8d2bd0e1503a0ceb7de1563d2321f8555bdef1d17',
        },
        {
          name: 'same',
          sha256: 'd93b23c4d5f1f8aaeaf97b4b436412ad251b36e36075b8d6ebb00365b97830cc',
        },
        {
          name: 'sha',
          sha256: '4715026b19f767e35e11ac89248faa6fa3fd13362bf8f23a471f9eb7f1705439',
        },
        {
          name: 'fail',
          sha256: 'cafe2ebdf37a3da1258a00cb0eb9191a3d036ccc757d6ff1c4602da6ea99f372',
        },
        {
          name: 'privateDirectory',
          sha256: 'c34da72cb91763f837191ec9e7f84f33f32ad2d7d19656d735482e634692950e',
        },
        {
          name: 'nonnegative',
          sha256: '793ff7fa6899243c565b48c28ad1710339c0a94f65d62cc4707637f23de0636d',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: '35cc497ffe84235d17caf93232d990c1fd9b5794210e52cc5497cd9630e1a8a2',
        },
        {
          name: 'FIXED_COMMAND',
          sha256: '0ff713f75bb9179176b4c3285edb567902f1c8a703b8a44a887f45f41ca9b448',
        },
        {
          name: 'WITNESS',
          sha256: '43083612c4cfb551e096ff987d48f21fbd93793e0ca894e240b7297135897c44',
        },
        {
          name: 'GIT_READINESS',
          sha256: '6723162a4342ae895b18f7dddd38efe74471783f7893de8488eef7ef559d845b',
        },
        {
          name: 'ENVIRONMENT_PROFILE',
          sha256: 'fc732e4285f3337eef9013d920baee7061ec7ec1df95858aeb2dc9ad84ac3794',
        },
        {
          name: 'STATE_OBSERVATIONS',
          sha256: '84634455683994c4c3f9235e3857cf06e57888024c033546c37cfd1cae0fee7d',
        },
        {
          name: 'PERMISSION_DIAGNOSTIC',
          sha256: '1091f74ff2834df691048f65b6d005fe54c5f1f4a32d682b0947a1f0bf846218',
        },
      ],
      changedFunctions: ['readPrepared', 'verifyAuthority', 'verifyR36Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r36/r35-evidence.mjs',
      sourceSha256: 'a6e5b3c48e493a7fdababfa6d0c227484553fa057be079eda6ef2362e87b94e7',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r35-evidence.mjs',
      cloneSha256: '26800a69a18bc0f4ae5aa67002dc4ba12855d2a656cd559a4355fa23d7c8ef31',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'countsValid',
          sha256: '53c77b7474bbf6525f9663a806dc99b85b9c47de2fa3400984e55b773d326b71',
        },
        {
          name: 'verifyJournal',
          sha256: 'c85e672bd889a3418942c44573bdcb0b904cd4c49c54de83d1d61a5d3fff50a8',
        },
        {
          name: 'expectedNames',
          sha256: 'ab483ee516dc8ca00361b5897b886c07b604e65d5f53e0b02a11a58992876809',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'OLD_ROOT',
          sha256: '4df04ad0ed8b7c8aaf58dafcca89d43f91de93e05eb45d43fb4cdbe7e4006b3e',
        },
        {
          name: 'MANIFEST',
          sha256: '019950beb808133496801101b0847e1fdf86aa7ea29731bb4091395eb823db42',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: '86576d173fd719d44445b371d9aab197466f6db0d6eec4eb368f3489b64b09cb',
        },
        {
          name: 'MANIFEST_DIGEST',
          sha256: '4126ec35a51bb3b59c1223b94a98f8f01ab12d3ac53e798e3205597f4f5b2ce8',
        },
        {
          name: 'TERMINAL',
          sha256: '0d3623ce991d1b70ac6fb3595e4affedf2997e7d37649f2959f864e75992f044',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: '96e7a7c253c15723c806b03f81e9130b68908d61639461cd4bf16a2d57a6bad5',
        },
        {
          name: 'INDEX',
          sha256: 'e2b05f55dce9498d11af62915470c2f19bffb465172264d852cc5c0f0f5eb91e',
        },
        {
          name: 'INDEX_SHA',
          sha256: '27f4a153230236ef4e05dc8a0131291339a2be766244970692ec3665e6dca052',
        },
        {
          name: 'CASES',
          sha256: '14dee20c2f603d9b4e8678c75e4178ead56347f7bf241359df7c846971304099',
        },
        {
          name: 'R35_COUNTS',
          sha256: '34829bef72bf991042f7e03801e80eb005cff4771cf1eb477afafc2286c2b2f2',
        },
        {
          name: 'SHA256',
          sha256: '08a5785ec644df65498a1026870a3d013c34dcfd0b82c6ff25a0f4f42cbb506e',
        },
        {
          name: 'KINDS',
          sha256: 'e7503ae4813b32146824bba683608a7fbb96c220ea8af0dd59c6709d9ad857be',
        },
        {
          name: 'same',
          sha256: 'd93b23c4d5f1f8aaeaf97b4b436412ad251b36e36075b8d6ebb00365b97830cc',
        },
        {
          name: 'sha',
          sha256: '4715026b19f767e35e11ac89248faa6fa3fd13362bf8f23a471f9eb7f1705439',
        },
        {
          name: 'fail',
          sha256: '7e601640334381b622442bbb398475130c0f07cbe5ead1fa2d2832cdc2c4e562',
        },
        {
          name: 'privateDirectory',
          sha256: 'c34da72cb91763f837191ec9e7f84f33f32ad2d7d19656d735482e634692950e',
        },
        {
          name: 'nonnegative',
          sha256: '793ff7fa6899243c565b48c28ad1710339c0a94f65d62cc4707637f23de0636d',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: '27a3f42a39b35a345eb99678a9b16fa7ce283a763a7d941cb4f786ffcecded04',
        },
        {
          name: 'FIXED_COMMAND',
          sha256: '9f29ef748cabdb47005b6c87b2222df0b19ab04bb19542b5768cadc058dfd20f',
        },
      ],
      changedFunctions: ['readPrepared', 'verifyAuthority', 'verifyR35Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r35/r34-evidence.mjs',
      sourceSha256: '53b82cf59277279112e6681afae04b742f7e678ac5f12e882e46e4148918a9f6',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r34-evidence.mjs',
      cloneSha256: '0239296bd8c8e5ac29459b9c426fa6325033cdf5e15c2098a49eac54f1a3d048',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'countsValid',
          sha256: '53c77b7474bbf6525f9663a806dc99b85b9c47de2fa3400984e55b773d326b71',
        },
        {
          name: 'verifyJournal',
          sha256: '822befc36df9dc0a4e57cd8df122e2c9c675334b933ede6492fc64655a629f95',
        },
        {
          name: 'expectedNames',
          sha256: '3b940c9b5acdc540202d59d2878c20d4b9572005430b6e993fb1e196d39df145',
        },
        {
          name: 'verifyCase',
          sha256: '0ce7b472b0ff6fea4173ef104ab4a08fa22b88a1102e05c4e4f3f87421f46b29',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'OLD_ROOT',
          sha256: 'd6bd1955537324420330e0724faefd5239bc4a06beeea9787191322e458a06e2',
        },
        {
          name: 'MANIFEST',
          sha256: 'ed8295719f3e2362704d2770c114cf9da8ff11eadf97650103baa0f6d18e625c',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: 'a01fc1aa85ac572d78ac89cb07472b53ba92c6cdd433e378c3b272c63234bb03',
        },
        {
          name: 'MANIFEST_DIGEST',
          sha256: '6ac59a06da4a0fbb3278d30891b6469796e54664fc25e5c624fdb4458a11265e',
        },
        {
          name: 'TERMINAL',
          sha256: '2e68600b8edb8cc42e8c00b46e01a7bb7a642b0117ec4b8512432879461a4c10',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: '22b37fae561a389537842c43c6fb8a4ea6cb9b6385e86ba142742e965d9054bf',
        },
        {
          name: 'INDEX',
          sha256: 'ce16b24a1e5e159d11a8b6f57262e8af7d2c6fb677403bf0d2f7b36c21207cd4',
        },
        {
          name: 'INDEX_SHA',
          sha256: 'd25fcb1a1a39d024c47d1af789376305dfe4f2c9df36c58828d8b1d520a99a39',
        },
        {
          name: 'CASES',
          sha256: 'ab5e1f125c9785eff0aa130181cc940c8b4f0c952436b46246f5d0edab7e35b9',
        },
        {
          name: 'WITNESS_PINS',
          sha256: '4091071dfae7f5b77c17e485dccf0e5620a7133bfdfbf876b7c9290a8f8ac866',
        },
        {
          name: 'R34_COUNTS',
          sha256: '0ce7be3fa9cd1aa64df818e0244db337dc649529a20fac159fe010045f063ea9',
        },
        {
          name: 'SHA256',
          sha256: '08a5785ec644df65498a1026870a3d013c34dcfd0b82c6ff25a0f4f42cbb506e',
        },
        {
          name: 'KINDS',
          sha256: '81294942a56c56e7cb1d07c9725d23760918fa61e4422ab78a39461b84fbbc33',
        },
        {
          name: 'same',
          sha256: 'd93b23c4d5f1f8aaeaf97b4b436412ad251b36e36075b8d6ebb00365b97830cc',
        },
        {
          name: 'sha',
          sha256: '4715026b19f767e35e11ac89248faa6fa3fd13362bf8f23a471f9eb7f1705439',
        },
        {
          name: 'fail',
          sha256: '33138258dbd58e6abe1d34e4e5e36bda351c5ca0d372c033133cdb9b50e015b3',
        },
        {
          name: 'privateDirectory',
          sha256: 'c34da72cb91763f837191ec9e7f84f33f32ad2d7d19656d735482e634692950e',
        },
        {
          name: 'nonnegative',
          sha256: '793ff7fa6899243c565b48c28ad1710339c0a94f65d62cc4707637f23de0636d',
        },
        {
          name: 'consistentOwnedExit',
          sha256: '577882a1560a20a3de03c895fde2644ec7e8d034857d58eb7713b639b844b707',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: '5ba0831c9eeacb5b21fb1893aa11c9206b7f1639f7631b44f6e315f93533fa88',
        },
        {
          name: 'FIXED_COMMAND',
          sha256: '7db3eb30b14e26bca3dbd7ed8421715ba0d76d3d0e02832fe99912098b6cab85',
        },
      ],
      changedFunctions: ['readPrepared', 'verifyAuthority', 'verifyR34Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r34/r33-evidence.mjs',
      sourceSha256: '1174c538078aec8dbc055fb989edf389234ad8a18c9330d8d5d7e6f2de44612e',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r33-evidence.mjs',
      cloneSha256: '6eb85f18185a51df48c1bd3e48f6752e37626e2b7eae4b2baacdd8a6297be5f9',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'verifyJournal',
          sha256: 'c3e50e2aa80eceafaef2e0ffe89ff9fe97cef756eca65e22c22d4825dd09e09f',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'OLD_ROOT',
          sha256: 'f8e9b11c5cc7a9812be0775d1d0afbdc1dca0089db01fd785bba03806bf281dd',
        },
        {
          name: 'MANIFEST',
          sha256: 'd38aedbfaa2d0c7335cb2cb5701e189d7e2c76507b6a5ed43825d48ddf30ce47',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: '3b117ea9b8a62dda6ad15eb229521d863dadc47993a0a09846e3b3f8783fe483',
        },
        {
          name: 'MANIFEST_DIGEST',
          sha256: 'f96e7958062581585e5fa70e8d6ae93599e27376cbdbe84d779d6bf0ac195972',
        },
        {
          name: 'TERMINAL',
          sha256: '89a78da133fb76caecf413f42bc08d7ed2be261570efe8c9b63c030d313137ff',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: 'edef031099e6265f016d6c8ba27a7131af5bd896def0fe867eccfe77be8b7157',
        },
        {
          name: 'INDEX',
          sha256: '9a57398e8dd113f47165d9e7bf56fe5c4909eaa77857f67c722c464534433ab8',
        },
        {
          name: 'INDEX_SHA',
          sha256: '624d96faa8a26e363f6ca56e1bc5f91ed6714cdee46ab2c16ddcd22b661f4df3',
        },
        {
          name: 'CASES',
          sha256: 'd45f1c9f85c46b3c9f0b6859a55443bdfe9b84af9d8ab9cac55b24f3f6e9a061',
        },
        {
          name: 'WITNESSES',
          sha256: '7407252fb945a4e1f09aef77fe9e8be7de19279477920d3c516e94a95291d32b',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: 'd72892544ec50e7e396dc81c006f5363ec40ff7d232e2dfbd1e984cb0ee0b44a',
        },
        {
          name: 'FIXED_COMMAND',
          sha256: 'ffc347280f3150c50c19764aaaf3687876962f965ee8c6d950d1fa5c56957842',
        },
        {
          name: 'R33_COUNTS',
          sha256: '3f12db066b4d98e3601bd9f35133e1e76ae7ec311be8fbb8910639f7f921dfd3',
        },
        {
          name: 'GIT_READINESS',
          sha256: 'e6d91d74c4628dc4a68efd0cf7907bde6a4cf31146f3a13ef1267e226e65076f',
        },
        {
          name: 'ENVIRONMENT_PROFILE',
          sha256: 'c11ec256ae40505b91bb0341e36af4ea821b2e2645368a11ceabed1c104150b5',
        },
        {
          name: 'STATE_OBSERVATIONS',
          sha256: '6fa9aead7d830814375e97d26e964594a4819c8d939dceaba103259df6df016b',
        },
        {
          name: 'fail',
          sha256: '0d84cedb3d2fe994ea3dfc54fa9524c7d2aee9e0656eb96bcea248a65c0c1b10',
        },
        {
          name: 'same',
          sha256: 'd5fe8fec58cb187a9741d143aa31d2635aca3cb54d83c2350df8e067553e8091',
        },
        {
          name: 'privateDirectory',
          sha256: 'c34da72cb91763f837191ec9e7f84f33f32ad2d7d19656d735482e634692950e',
        },
      ],
      changedFunctions: ['readPrepared', 'verifyAuthority', 'verifyR33Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r33/r32-evidence.mjs',
      sourceSha256: '9cbcc33b3a704702168c83b01dff64e96d7bfc11f1a28e5049c5eec69ac292de',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r32-evidence.mjs',
      cloneSha256: '54a5c1fe47c56d3adc8a5da713fd234ed7beda76bf7d00f94691acc6291eec18',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'verifyJournal',
          sha256: '84ae23c102cb54ecee937b32756d4a3fa298deee955199574887ad00a2d36a02',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'OLD_ROOT',
          sha256: 'bfc7f20e14993ffb31a7644df226b70d45708b9d1f7164b28938cf8f919329ef',
        },
        {
          name: 'MANIFEST',
          sha256: '18dc1564e26cf3defc8140d00886d3b5e239c48395f49c57a3c3decf89efb1cc',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: '42172161413d012005f4545b628c2005c41d022af3b81b7a73d9cd1fcb0e6bd7',
        },
        {
          name: 'MANIFEST_DIGEST',
          sha256: '918bc438aa9e84f21721c04e41517860a83edecc5e12f307357de4b414de0d4e',
        },
        {
          name: 'TERMINAL',
          sha256: 'fff6eb9cf3176c4ae757c9b02c3418635af89bd873b164c208e63436353af004',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: '00913bd969efdb0cd99b8abae3ad4048ca2ec99fc03ee24491b06225f4da383f',
        },
        {
          name: 'INDEX',
          sha256: '298512a9ddea882180d0fd347d728561dfce63bec14360749fb0ac9cd55614a8',
        },
        {
          name: 'INDEX_SHA',
          sha256: '1e14801f3322dfb7b76fd721e15d8b9cd0efa5f4f997449b0c96621400e0fa3b',
        },
        {
          name: 'CASES',
          sha256: '2ba90d5061f627444990606a595be41b394d0f02afef558f906fd00735953932',
        },
        {
          name: 'WITNESSES',
          sha256: '0e0834705c6410558557c44bf5416806433dfbc2bc2c7c9a2b990d51d3cb0647',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: 'b0ba6ba7f166cb16beb9952ee9e60f7c744dc05465e9f91f2488a08aec6c51d8',
        },
        {
          name: 'FIXED_COMMAND',
          sha256: 'cc914185a7000b843b7efa5b509b8fb901bdebb0255ea5f764a793f3e60b8687',
        },
        {
          name: 'R32_COUNTS',
          sha256: '3972f6678f3d00cb5aeae9e229112334f217e0ab68d9dcfe0f2b98ee45cc6cfa',
        },
        {
          name: 'fail',
          sha256: '7732bc5796672d81be2dd1f6a2789a49869c15af17fcfa9fe4cdcbb9436f379f',
        },
        {
          name: 'same',
          sha256: 'd5fe8fec58cb187a9741d143aa31d2635aca3cb54d83c2350df8e067553e8091',
        },
        {
          name: 'privateDirectory',
          sha256: 'c34da72cb91763f837191ec9e7f84f33f32ad2d7d19656d735482e634692950e',
        },
      ],
      changedFunctions: ['readPrepared', 'verifyAuthority', 'verifyR32Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r32/r30-evidence.mjs',
      sourceSha256: '1da978707f0cf106e3d8c0eee0aa81894a7b6821e71cf1241c55fb56480292f5',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r30-evidence.mjs',
      cloneSha256: '855a8085f8deb8aa85420bc2341a3c71f7d28a6a13958ada931ccd9f73b7be61',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'verifyJournal',
          sha256: '293a4903a7c1d669eeb74977ee92f9e7d5a441905d9133121acc3d7480080760',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'OLD_ROOT',
          sha256: '80fadc347de5e840306accde4574359700537cbfc7ec08962c4d3708b25365c8',
        },
        {
          name: 'MANIFEST',
          sha256: 'a0ae41a4f527747e285148d17a1b64fec5e3d334f27b498dcafbb4b0325ba149',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: 'a4bc4c59f02f48654e441599a99539140ecc620a2df383d0e8e8146689083cc8',
        },
        {
          name: 'MANIFEST_DIGEST',
          sha256: 'e1b40e21f2e0c31da2587763f3ccfdb6a5082370a4f6e413690eb46b5cc8c516',
        },
        {
          name: 'TERMINAL',
          sha256: '477e30ccba1ea9c8a9e152f8441cc7313b1c1da756f1f342f0d0f675971aa432',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: 'ca8a81cd7eac8a7f2c1e21001fa1e6632c87d340d2ef39f5e95b9107dd2a4783',
        },
        {
          name: 'INDEX',
          sha256: '5a3789725fc910203525ee0a86e56924e28775b0a3d92604f19041bee47ac936',
        },
        {
          name: 'INDEX_SHA',
          sha256: '41d6681d290b67362955381a07575539253a1ddd171c941e4d6b5f30011d7be2',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: '12f4767a64982d19b4f9299f4da41516a934e45c8d2e02e28c6437f6238a43e1',
        },
        {
          name: 'R30_COUNTS',
          sha256: '71700840e083cea7efb0ae32270143445f80145e98eaa1ed11037f32b6601062',
        },
        {
          name: 'fail',
          sha256: 'f5bbc058b7321738afb973ddb0e49f22b3673b9a41f7d72faf8ab67a1f2ee12f',
        },
        {
          name: 'same',
          sha256: 'd5fe8fec58cb187a9741d143aa31d2635aca3cb54d83c2350df8e067553e8091',
        },
        {
          name: 'privateDirectory',
          sha256: 'c34da72cb91763f837191ec9e7f84f33f32ad2d7d19656d735482e634692950e',
        },
      ],
      changedFunctions: ['readPrepared', 'verifyAuthority', 'verifyR30Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r30/r29-evidence.mjs',
      sourceSha256: '74b0c06715189419ef667570ff4b5bd6e77ba172befbe5a4bd3013c4d1cda415',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r29-evidence.mjs',
      cloneSha256: 'f9b0366556c5cbdcb072509c26abcf1429b67eefb2124fbcc5167ac4cd5a5337',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'verifyJournal',
          sha256: '04fc3c3f7a068d4c92b90d104df277d2cc9898c20f998a54edd4f3bfba211738',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'OLD_ROOT',
          sha256: '2077a75d1a0982d108b5bc48d320fd01b0f4eb8af3c3960e472c4293264ff36e',
        },
        {
          name: 'MANIFEST',
          sha256: '0744b1635cb335f2c1c3fcaa340b52e0da37e50c6613b34b932aef5ba8988e2f',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: '9bba51d2aed119de777358c02527f4d4774628dcf743edac8ac2d94413057d51',
        },
        {
          name: 'MANIFEST_DIGEST',
          sha256: '3fcf8fdbc61e7a1ead7bd49af56c7e1a8c8bf356fc46841347e4f1da74ffc4fb',
        },
        {
          name: 'TERMINAL',
          sha256: '3b366df15341292e6f2b3ca1353405dda84f8a836470bcc9d77601fffe877f49',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: 'acd27f731f343322e33030181b112e612634f1c4da0de77d08b4dd50696c8203',
        },
        {
          name: 'INDEX',
          sha256: 'dd2a33496ac39d5f0c27c8489be1c3a139307a27e213cafa1cf0f228771d055e',
        },
        {
          name: 'INDEX_SHA',
          sha256: '96a6dbf5b387e2ca03ab374376401df74e4010458d3f11fbaf550b5f8555438b',
        },
        {
          name: 'CASES',
          sha256: '71da7da728a64695418354c757a9b90d857235958a1b7c5af308b092eaba7877',
        },
        {
          name: 'WITNESSES',
          sha256: '77e9ccbf0e86b3566036518be862962ac3b1d8e23f5eca77d55d80964dc8aeab',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: 'a8f0dd3cfc28b38c31945bba0b041cfc54b6bcbbb58579aff784ce5a9ba0f1ea',
        },
        {
          name: 'R29_COUNTS',
          sha256: '4961a0375ba5c7e5d7c1285e795ba6b06f91514a07d58d6d33414fdc5302e022',
        },
        {
          name: 'fail',
          sha256: '14d8ecf3f4740bcc1edd607868fd101baa1ebdc872b244e34790d4e50ecc6623',
        },
        {
          name: 'same',
          sha256: 'd5fe8fec58cb187a9741d143aa31d2635aca3cb54d83c2350df8e067553e8091',
        },
        {
          name: 'privateDirectory',
          sha256: 'c34da72cb91763f837191ec9e7f84f33f32ad2d7d19656d735482e634692950e',
        },
      ],
      changedFunctions: ['readPrepared', 'verifyAuthority', 'verifyR29Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r29/r28-success-evidence.mjs',
      sourceSha256: '4fb165309f42f7d395c75f7a8323fc8ddb33bbc5d5f0ed1df9d2758cffa59a76',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r28-success-evidence.mjs',
      cloneSha256: '3e01a9d6c7f9b4a1d2688672db12d1213d29593cf8b7b9a4a5e741999ca7b9cc',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'verifyJournal',
          sha256: 'f8ac07a46acf81f070081065ad038a5a654e5165b03afc8de172cede38c0b6ad',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'MANIFEST',
          sha256: '3d135f0f2edecf337e82410c66018b3739bbef1fccc5c7de4bf116e88a9e3cfa',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: '913a9c6972f38d76fe98f6bc758fe928df4eaf0a8f44f25837466c1537da4486',
        },
        {
          name: 'TERMINAL',
          sha256: 'daa58f67fbf233128b33d102f29422cbba89d236db3bcd46dc3e258d5cd42169',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: '7d6aa1c43fe83064bce00b7ed1251e2cdb07c107f44caf036e7bad8fda4b74b9',
        },
        {
          name: 'INDEX',
          sha256: '3ea79fae39bcbf857afbeb3ea49a8f41f2b8681cab178b9d4c6182c1dac271a8',
        },
        {
          name: 'INDEX_SHA',
          sha256: '20819e9c97665350bfed841ca6fe0bda4827fe0fac7feb78b2edf8066de516fa',
        },
        {
          name: 'ROOT_R28',
          sha256: '0245574d2487ac0686309673dc037f1ef4f3bca3a5886bceabb1128d896b7163',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: '4e3a7b2c724a5f5c917f227bfe7cf0118ba7179eba978654a50629a272cd1f6f',
        },
        {
          name: 'EXECUTION_PLAN',
          sha256: '17c6cd04a22ed7f3abf91504737509fb5c4e31e2e3fbf168719e450e7ee2af24',
        },
        {
          name: 'EXECUTION_PLAN_SHA',
          sha256: 'e109c69a340851c7ef8d63502a1a99e6a0ae8fda17859cd623fff8e79cd9174e',
        },
        {
          name: 'CASE_WITNESS_SHA',
          sha256: 'f5f2b25dac171800a64e371701e2caf1b698d1742b6469bb96676bdd3722597c',
        },
        {
          name: 'CLEANUP',
          sha256: '71ef807606b3d303895056e75376fda91c2220cf031d9ea2ce2764505b197b13',
        },
        {
          name: 'R28_COUNTS',
          sha256: 'e99f5daa94a03427a178e0a7785d4a137a3bf2961dad08c0e8c85a6162f3de61',
        },
        {
          name: 'fail',
          sha256: 'ee00c6dc0fc44edb4942aa9147b366ecb111edb66a30339a6bdc5fe2a68cc1c8',
        },
        {
          name: 'privateDirectory',
          sha256: 'e9ee8588e4faf71596f8f31df0f42a784a637803f8f745fc96eeb8347005b5aa',
        },
        {
          name: 'sameIdentity',
          sha256: '80d8172f6062ae272cea8f7a2396fa58e26eef6e308428ad5cd8ae39f8ea1100',
        },
      ],
      changedFunctions: ['readFrozenR28', 'verifyAuthority', 'verifyR28Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r28/r27-evidence.mjs',
      sourceSha256: 'cb76c82b7fd440d178c5406a56665b7a2532972d5e11f75d03f9cb2b9080c3b6',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r27-evidence.mjs',
      cloneSha256: '32167e66bca075c95f18fac2ea73a43922f07d0690da6d429db1555e28bf4a35',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'verifyJournal',
          sha256: '1e99ff9ba31fe5044427c26dfae6cadd762db97cd2bf441e4dbab94cd06b3734',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'MANIFEST',
          sha256: '7d54a1017c382e356c581a5b6d62cf6de91f5524f18db6e16255ccf872c1f541',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: '19c7bcab5de9c8503bb490006cb1b422fee43f8e6a63b84ba5611f0e5ea641ed',
        },
        {
          name: 'TERMINAL',
          sha256: '5a025519ac9f7b6e4b995a74f7e1868ce1b7bde350f8bcd6024f5967c728f4c2',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: '045ea326456c88a87e1da24f21d7058dd578fe4920bf0279c698fdf6b743e4d6',
        },
        {
          name: 'INDEX',
          sha256: '386effdcb1e6cac33e07e6137e8fde2830abaf5be63e06bee00e276813fd13a2',
        },
        {
          name: 'INDEX_SHA',
          sha256: 'e4d127a3ff188b1f0b59469b2949fe5c7a88a6cea578ed847096df0a284a52b0',
        },
        {
          name: 'ROOT_R27',
          sha256: 'ade0671477e9d70585db6f137ab4cd2661102ad9d6a55de6e774a46f98749566',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: '4dc9de953a5d9bfe81a861a5f3321d7eb4e90c86b3ba0376f9d74a9da6e4a640',
        },
        {
          name: 'EXECUTION_PLAN',
          sha256: 'f6d31fa86037a87a87a8fcf22ad0c7201523d24e49ac98196af02cb7f5fe175b',
        },
        {
          name: 'EXECUTION_PLAN_SHA',
          sha256: '987dc3348b06509b5b75b4196e48931b16858dcd9e5350062be5c661ebb9c504',
        },
        {
          name: 'CHILD_PATH_OBSERVATIONS',
          sha256: '65a4cf4ecd5f7c94bf01105f34fa145a72d84d784bb17ffb4eaea156c892251f',
        },
        {
          name: 'R27_COUNTS',
          sha256: '2767fbe0082417d9964f029609e7d50c83cbf76a2a531ada4d6832888911d17f',
        },
        {
          name: 'fail',
          sha256: 'ec82dfb32d38e65686d4cc843d67ff5ea4083569f3c0eb1ad46602b4f78e5eeb',
        },
        {
          name: 'privateDirectory',
          sha256: 'e9ee8588e4faf71596f8f31df0f42a784a637803f8f745fc96eeb8347005b5aa',
        },
        {
          name: 'sameIdentity',
          sha256: '80d8172f6062ae272cea8f7a2396fa58e26eef6e308428ad5cd8ae39f8ea1100',
        },
      ],
      changedFunctions: ['readFrozenR27', 'verifyAuthority', 'verifyR27Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r27/r26-evidence.mjs',
      sourceSha256: '9f8963a676c5e684c3eddc81d5804bbb6d2659c42398419666d11a4dd22bfed1',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r26-evidence.mjs',
      cloneSha256: 'e37baecb0a6c54f93b3f7ab05507e5648674090e448fc5f640590e6a73c4d88d',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'verifyJournal',
          sha256: 'be68d21e5191c62eaac22e4aa48a56ba1457d43c05c7a2177c13963a13ae9b9a',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'MANIFEST',
          sha256: 'faefc57fe7f56a746a651f690314ad82242c01d963bd6b49faacb6d0568488ee',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: 'a213ff15a991577c42de6a92aab33c538752d69c2046f3a86d3e3f26d23c2242',
        },
        {
          name: 'TERMINAL',
          sha256: 'e70d03935aa25515d091471e79faf16868ef71db7c6a19c919194a70832d58b7',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: 'e02ea86b1558184b6220c136f104670b111a0382d605bec2893c83e669b988a5',
        },
        {
          name: 'INDEX',
          sha256: 'ebe3a2a9b9fe6e1abe794168ae5305c4e080d33e353357581b61ec2a1d43603e',
        },
        {
          name: 'INDEX_SHA',
          sha256: '20fff423b22e844a94be262e6d04e71cfd24a36076af82d2a8b0599d6ab652d4',
        },
        {
          name: 'ROOT_R26',
          sha256: '726a76413db3dcb9f5d699a0101d386f95812a576ac57f5aaa1829642993a9ef',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: '9c75dacd8916399e366829d4e5fa3789974f01f3e20dfb98817b90845abd64a4',
        },
        {
          name: 'REQUEST',
          sha256: '9cd9d31af9736288fdb09d9b213f064bed20de262d87f63d96e73e61f00b9400',
        },
        {
          name: 'REQUEST_SHA',
          sha256: 'c0b228a20cf5ca45061a5907fc17fc5fd70b8265b359ec22404b4f0acd5f7f2e',
        },
        {
          name: 'R26_COUNTS',
          sha256: '909d4d15452cc83ac290949c770ad52dffe77fe55a238f51d9d18ea0a97e88dc',
        },
        {
          name: 'fail',
          sha256: '2c679b4e7e211b47276571c89457dccc777c9f07aaacc790fbda72f62cd36d2f',
        },
        {
          name: 'privateDirectory',
          sha256: 'e9ee8588e4faf71596f8f31df0f42a784a637803f8f745fc96eeb8347005b5aa',
        },
        {
          name: 'sameIdentity',
          sha256: '80d8172f6062ae272cea8f7a2396fa58e26eef6e308428ad5cd8ae39f8ea1100',
        },
      ],
      changedFunctions: ['readFrozenR26', 'verifyAuthority', 'verifyR26Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r26/r25-evidence.mjs',
      sourceSha256: 'b0d385ff45c3b4571adbbf7f17b59d674d24c1c443956b11e4bbd1451aea8089',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r25-evidence.mjs',
      cloneSha256: '177fb55cae0a52967aeaa361bfb98691b585378866a958a66f634fc00860146a',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [
        {
          name: 'verifyJournal',
          sha256: 'a5f03779ef26bea241ff788170a70ac593b158d1a296683de43c533d4cb12f9b',
        },
      ],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'MANIFEST',
          sha256: '5254ca59c9f092b94ef10f2b23820a2b90a3a74c19ca8357e8e7c2f5a6ba45a8',
        },
        {
          name: 'MANIFEST_SHA',
          sha256: '1a147dbfb81df94c33c1b1d6fafb17a6ccc58e1dae096caeaac848d0261bc829',
        },
        {
          name: 'TERMINAL',
          sha256: '6b9bb7d2307907522bf72e7d212daa84a45ea234bce4ac980f5ebf369e8bfc8f',
        },
        {
          name: 'TERMINAL_SHA',
          sha256: '0fff989e682b98064fe2a48e0dc37a917242c7069e33d5246f63dd4846e99fc5',
        },
        {
          name: 'INDEX',
          sha256: 'e08fbf8d8216a82e03a92c8d71b208e8fcca6f42df76a54aebd69c3f53c86ec7',
        },
        {
          name: 'INDEX_SHA',
          sha256: 'c17a60980a390ead5fe240146bc561d60e35fc5d895887f8f1afad788453d35e',
        },
        {
          name: 'ROOT_R25',
          sha256: '6d5be713f06052c4194a7d672aac35db2e812967715544931807f6f920c35762',
        },
        {
          name: 'AUTHORITY_PINS',
          sha256: '36307e1251d762973d105d3f369a88852c15e6f89567e227eaecd002ebf265e4',
        },
        {
          name: 'R25_COUNTS',
          sha256: 'c16a3c8069b3da210fdceed684cdd7e5a6b27587c461897c4c77deb2942b6898',
        },
        {
          name: 'fail',
          sha256: '9967dc6168de86d01b3a0190d0dedaaafd83e75685f9d8b519ad9d5316a67832',
        },
        {
          name: 'privateDirectory',
          sha256: 'e9ee8588e4faf71596f8f31df0f42a784a637803f8f745fc96eeb8347005b5aa',
        },
        {
          name: 'sameIdentity',
          sha256: '80d8172f6062ae272cea8f7a2396fa58e26eef6e308428ad5cd8ae39f8ea1100',
        },
      ],
      changedFunctions: ['readFrozenR25', 'verifyAuthority', 'verifyR25Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r25/r24-evidence.mjs',
      sourceSha256: '97c69b1c869c0c34850d1726b216954b921a477d4796042268366f88d071336c',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r24-evidence.mjs',
      cloneSha256: '504aaa8d1322cf6ed5793bc6b35fef2d83c9c1a2bf59b0d92674aa6572a607b7',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'TERMINAL',
          sha256: '670120515e4c24563dfdfa665dcc94343dcfd6d0b64de57f6212b400fc55da3f',
        },
        {
          name: 'INDEX',
          sha256: 'fed9c83e761ad25efe12e49ef56d8e67e98d852ccaea9e32cfed51857027622e',
        },
        {
          name: 'ROOT_R24',
          sha256: '2c47ba23dafd9a352cde2ad9e575c2ae123132f044f17ffe655293e0f5427b6e',
        },
        {
          name: 'R24_COUNTS',
          sha256: '87f90abeff0519d8d92bf76ea632093ed592d5d4ad35339f7d5306491f1f0ddc',
        },
      ],
      changedFunctions: ['readFrozenR24', 'verifyR24Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r24/r23-evidence.mjs',
      sourceSha256: '10756e6c20e8613526a1c0a0477d08d518746ca364eee21a530cbe139a4a775a',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r23-evidence.mjs',
      cloneSha256: 'c3bd752d126bf05c86d8d8947462ebb682d2a78e7f5ef0c8c19ee4ded08d20d1',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'TERMINAL',
          sha256: '9dd53ebeaa729bd4c5c02a42ee3eb36fc8d16024768cd1cbcc0357ccb902440c',
        },
        {
          name: 'INDEX',
          sha256: '02148bb706dd6161ce1b2a5983c43f0723a0a39cc9201361808b511f59ef9765',
        },
        {
          name: 'ROOT_R23',
          sha256: '7eb166260085a513e2c3e3e996d79fb79db5d0461595dd1371f979bb32de4a00',
        },
        {
          name: 'R23_COUNTS',
          sha256: '37b9c1315026af9bb4cd3fed9c2f1d6630586f69fa8051ddd6296ffcb1f0bca5',
        },
      ],
      changedFunctions: ['readFrozenR23', 'verifyR23Predecessor'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r23/r21-evidence.mjs',
      sourceSha256: '59d8b8f8857d88d04a4b7eec6d8c6c6dd4258063eaa33fe3ef2e12445d0ba21f',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r21-evidence.mjs',
      cloneSha256: 'f8a234e96329f80634eebe44c4bebb7656edbf2f249b806f39cb5c81dfdee9a9',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'R21_ROOT',
          sha256: 'a3974efda6818e38df58db4b54160dc1f1074958f487888141ed7b62b3110e92',
        },
        {
          name: 'R23_ROOT',
          sha256: '3bc8b230a7442a7a22ee6882e3dbfa57c94aaac52e7dbf18f57fc5583b26c6c6',
        },
        {
          name: 'R21_MANIFEST',
          sha256: 'b0205a958603bc478a47ce35cae1bfc10e5d5346f0bb6a8fe02f38d05658babf',
        },
        {
          name: 'R21_SOURCE_REVIEW',
          sha256: 'd80089720e4a8cc7f3e800f22ac6d65fb6bffd571b532dcbf0b2713c4189c22e',
        },
        {
          name: 'R21_ACTUAL_REVIEW',
          sha256: '506d4e9c67b67deb7e5f8008ed529355fd41a280ae10523388b9e33d54503ee5',
        },
        {
          name: 'PINS',
          sha256: 'a6144dcfc2710eaf674b62915b5fb8cc100a5e7e42958fb71ea9daf7730543d9',
        },
      ],
      changedFunctions: ['readStableFile', 'verifyR21Predecessor', 'verifyRetainedP7'],
    },
    {
      sourcePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r23/r22-evidence.mjs',
      sourceSha256: '6c31bfbdc4d248fff90dcd4569e39a301938aacfd683d16400b3c6da5418b2aa',
      clonePath: 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47/history-r22-evidence.mjs',
      cloneSha256: 'ca43bf4feb905be39a19a9d24ea9b1af6fb348649aad844bb814c2476ab428c7',
      currentOriginalIdentity: 'UNKNOWN',
      unchangedFunctions: [],
      unchangedConstants: [
        {
          name: 'REPO',
          sha256: '443a006480a29db59a1f8f0b9e62c3cfabab2911dfe0e06fc225015b5e3a6bf7',
        },
        {
          name: 'BUILD',
          sha256: '69cbdc0800db4b9579151a7c69a3c8d8b25a121eda93886c92c493ca4280b6e6',
        },
        {
          name: 'REVIEW',
          sha256: '855fbd87e9c18b67749a9b9e4a48a21015fa2796bcd99b9c47d4f8500436a0b6',
        },
        {
          name: 'BLOCKED',
          sha256: 'e5c57ec4640f0b7293941918803da23cd255db58570fd450abce8b851611ccac',
        },
        {
          name: 'EXPECTED_MANIFEST',
          sha256: '43aa7352576c9a1682ac66ab746bbf7890c84c719834e0415ca66aad0103178e',
        },
        {
          name: 'EXPECTED_REVIEW',
          sha256: 'ca30c335950ce71d0490cd146fc8a1e2c8572dc9e33c6557db47b8df7e578777',
        },
      ],
      changedFunctions: ['verifyR22Predecessor'],
    },
  ].map(row =>
    Object.freeze({
      ...row,
      unchangedFunctions: Object.freeze(row.unchangedFunctions.map(value => Object.freeze(value))),
      unchangedConstants: Object.freeze(row.unchangedConstants.map(value => Object.freeze(value))),
      changedFunctions: Object.freeze(row.changedFunctions),
    }),
  ),
)
