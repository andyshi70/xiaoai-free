// MiGPT 配置：小爱音箱 mini（LX01）
// 注意：修改本文件后需要重启进程/容器才会生效。
export default {
  bot: {
    name: "傻妞",
    profile: "性别：女，性格乖巧可爱，喜欢搞怪，爱吃醋。",
  },
  master: {
    name: "主人",
    profile: "性别：男，性格随和。",
  },
  speaker: {
    // 小米账号：小米 ID（不是手机号/邮箱）
    userId: "",
    // ↓↓↓ 把下面这行引号里的文字替换成你的小米账号密码 ↓↓↓
    password: "",
    // 小爱音箱 DID 或米家中的设备名称
    did: "",

    // LX01 推荐参数
    ttsCommand: [5, 1],
    wakeUpCommand: [5, 2],
    streamResponse: false,

    // 使用小爱自带 TTS
    tts: "xiaoai",

    // 以下关键词开头的消息会触发 AI
    callAIKeywords: ["请", "你", "傻妞"],

    // 提示语；不需要可以改成 []
    onAIAsking: ["亲，稍等"],
    onAIError: ["出错了，请稍后再试吧！"],

    // 调试开关：首次排查设备 DID 时可临时打开
    debug: false,
    enableTrace: false,
  },
};
