from synapse.api.routes import dev_iwhalecloud as diw


def test_filter_up_alarm_details_only_up():
    raw = [
        {"fileName": "a.cpp", "functionName": "f1", "errorArrow": "UP", "ccnCount": 46, "benchmarkCcnCount": 37},
        {"fileName": "b.cpp", "functionName": "f2", "errorArrow": "SAME", "ccnCount": 15, "benchmarkCcnCount": 15},
    ]
    alarms = diw._filter_up_alarm_details(raw)
    assert len(alarms) == 1
    assert alarms[0]["functionName"] == "f1"
    assert alarms[0]["ccnCount"] == 46


def test_format_code_check_build_entry_requires_failed_state_and_desc():
    node_ok = {
        "nodeName": "SOURCEMONITOR代码检查(新)",
        "nodeState": 2,
        "nodeStateDesc": None,
        "modifyFileAlarmDetailList": [],
    }
    assert diw._format_code_check_build_entry(node_ok) is None

    node_failed = {
        "nodeName": "SOURCEMONITOR代码检查(新)",
        "nodeState": 3,
        "nodeStateDesc": "本次修改的函数圈复杂度超过10并且大于上次的圈复杂度",
        "modifyFileAlarmDetailList": [
            {
                "fileName": "BackServiceCpp/src/cpp/Zmdb/Helper/ZmdbConfig.cpp",
                "functionName": "TZmdbConfig::LoadTableGroup( const char * pszDsn)",
                "errorArrow": "UP",
                "ccnCount": 46,
                "benchmarkCcnCount": 37,
            },
            {
                "fileName": "BackServiceCpp/src/cpp/Zmdb/Helper/ZmdbConfig.cpp",
                "functionName": "TZmdbConfig::RefreshMonitorCfg()",
                "errorArrow": "SAME",
                "ccnCount": 46,
                "benchmarkCcnCount": 46,
            },
        ],
    }
    entry = diw._format_code_check_build_entry(node_failed)
    assert entry is not None
    assert entry["kind"] == "code_check"
    assert entry["resultType"] == "SOURCEMONITOR代码检查(新)"
    assert len(entry["alarms"]) == 1
    assert "LoadTableGroup" in entry["resultMsg"]
    assert "CCN(37↗46)" in entry["resultMsg"]


def test_summarize_ci_pipeline_steps_compile_failed_check_pending():
    nodes = [
        {"nodeNameEn": "COMPILE", "nodeState": 3, "runResult": "F"},
        {"nodeNameEn": "SOURCEMONITOR(NEW)", "nodeState": 1, "runResult": "R"},
    ]
    steps = diw.summarize_ci_pipeline_steps(nodes)
    assert steps["compile"] == "failed"
    assert steps["flight"] == "active"


def test_summarize_ci_pipeline_steps_all_ok():
    nodes = [
        {"nodeNameEn": "COMPILE", "nodeState": 2, "runResult": "S"},
        {"nodeNameEn": "SOURCEMONITOR(NEW)", "nodeState": 2, "runResult": "S"},
    ]
    steps = diw.summarize_ci_pipeline_steps(nodes)
    assert steps == {"compile": "ok", "flight": "ok"}
    nodes = [
        {"nodeNameEn": "Initial State", "stepZcmId": 0},
        {"nodeNameEn": "EXPORT", "stepZcmId": 176545},
        {"nodeNameEn": "COMPILE", "stepZcmId": 176546},
        {"nodeNameEn": "SOURCEMONITOR(NEW)", "stepZcmId": 176547},
        {"nodeNameEn": "DuplicateCodeCheck", "stepZcmId": 176547},
    ]
    assert diw._collect_code_check_step_zcm_ids(nodes) == ["176547"]


def test_is_generic_compile_summary():
    generic = "<li>【执行结果】 编译节点执行失败!\n<li>【失败原因】 脚本或者程序返回非0值"
    assert diw._is_generic_compile_summary(generic) is True
    log = "ZmdbConfig.cpp:13508:22: error: ‘class XML_PARSER::ZCXmlNode’ has no member named ‘GetChildNodes’"
    assert diw._is_generic_compile_summary(log) is False
    assert diw._looks_like_compile_log(log) is True


async def test_format_compile_build_entry_prefers_attachment_log(monkeypatch):
    compile_log = (
        "g++ -c -g -D__NOUSEDST__ ZmdbConfig.cpp\n"
        "ZmdbConfig.cpp:13508:22: error: ‘class XML_PARSER::ZCXmlNode’ has no member named ‘GetChildNodes’\n"
        "make: *** [ZmdbConfig.o] Error 1"
    )

    async def fake_fetch(_node, *, csrf="", cookies=""):
        return compile_log

    monkeypatch.setattr(diw, "_fetch_compile_log_text", fake_fetch)
    node = {
        "nodeName": "编译节点",
        "nodeNameEn": "COMPILE",
        "nodeState": 3,
        "runResult": "F",
        "nodeStateDesc": "<li>【执行结果】 编译节点执行失败!",
        "attachments": [{"fullPath": "https://example/log.txt"}],
    }
    entry = await diw._format_compile_build_entry(node, csrf="t", cookies="c")
    assert entry is not None
    assert entry["kind"] == "compile"
    assert "ZmdbConfig.cpp:13508:22: error" in entry["resultMsg"]
    assert "编译节点执行失败" not in entry["resultMsg"]
