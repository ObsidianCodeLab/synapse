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


def test_collect_code_check_step_zcm_ids_skips_compile_and_export():
    nodes = [
        {"nodeNameEn": "Initial State", "stepZcmId": 0},
        {"nodeNameEn": "EXPORT", "stepZcmId": 176545},
        {"nodeNameEn": "COMPILE", "stepZcmId": 176546},
        {"nodeNameEn": "SOURCEMONITOR(NEW)", "stepZcmId": 176547},
        {"nodeNameEn": "DuplicateCodeCheck", "stepZcmId": 176547},
    ]
    assert diw._collect_code_check_step_zcm_ids(nodes) == ["176547"]
