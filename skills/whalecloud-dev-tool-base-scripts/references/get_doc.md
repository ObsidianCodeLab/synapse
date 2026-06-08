# 产品文档查询脚本使用说明

## 概述

本脚本用于调用 SynapseService 的 `get_doc` 接口，获取指定产品的文档内容。

## 脚本位置

- 调用脚本: `scripts/get_doc.py`

## 使用方法

### 基本语法

```bash
python get_doc.py --doc_type=XXX --server_url=yyy --prod=zzz
```

### 参数说明

| 参数 | 说明 | 是否必填 | 取值范围 |
|-----|------|---------|---------|
| `--doc_type` | 文档类型 | 是 | `产品架构`, `产品需求`, `产品方案`, `产品手册`, `交付材料` |
| `--server_url` | 服务地址 | 是 | IP:PORT 格式，如 `192.168.1.100:8080` |
| `--prod` | 产品名称 | 是 | 产品标识，如 `分布式内存数据库`, `ZMDB` |
| `--doc_name` | 文件名过滤 | 否 | 指定文件名进行过滤（支持模糊匹配），多个用逗号分隔 |
| `--output` | 输出目录 | 否 | 指定输出目录，文档将保存到此目录 |

### 使用示例

#### 示例 1: 查询产品需求文档

```bash
python get_doc.py --doc_type=产品需求 --server_url=192.168.1.100:8080 --prod=分布式内存数据库
```

#### 示例 2: 查询产品架构文档

```bash
python get_doc.py --doc_type=产品架构 --server_url=localhost:5000 --prod=ZMDB
```

#### 示例 3: 查询产品架构文档并保存到指定目录

```bash
python get_doc.py --doc_type=产品架构 --server_url=192.168.1.100:8080 --prod=分布式内存数据库 --output=./docs
```

#### 示例 4: 查询产品架构文档并按文件名过滤

```bash
python get_doc.py --doc_type=产品架构 --server_url=192.168.1.100:8080 --prod=分布式内存数据库 --doc_name=TECH_ARCH
```

#### 示例 5: 查询产品架构文档并过滤文件名后保存

```bash
python get_doc.py --doc_type=产品架构 --server_url=192.168.1.100:8080 --prod=分布式内存数据库 --doc_name=TECH_ARCH --output=./docs
```
```

#### 示例 5: 查询交付材料

```bash
python get_doc.py --doc_type=交付材料 --server_url=192.168.1.100:8080 --prod=分布式内存数据库
```

## 输出说明

成功调用后，脚本会输出：

- 接口响应状态
- 返回的文档数量
- 每个文档的名称、内容长度
- 内容预览（前 500 字符）

**当指定 `--output` 参数时**：

- 自动创建输出目录（若不存在）
- 将每个文档内容保存到指定目录
- 文件名使用接口返回的 `doc_name`
- 输出中会显示 "已保存到: xxx" 提示

## 返回数据格式

接口返回 JSON 格式数据，结构如下：

```json
{
    "code": 0,
    "message": "成功消息",
    "data": {
        "doc_content": [
            {
                "doc_name": "文档名称",
                "content": "文档内容"
            }
        ]
    }
}
```

## 错误码说明

| 错误码 | 说明 |
|-------|------|
| 0 | 成功 |
| -1 | 网络或未知错误 |
| 其他 | 业务错误，请查看 message 字段 |

## 在 Skill 中使用

### Python 调用示例

```python
import subprocess

cmd = [
    "python", "scripts/get_doc.py",
    "--doc_type=产品需求",
    "--server_url=192.168.1.100:8080",
    "--prod=分布式内存数据库"
]

result = subprocess.run(cmd, capture_output=True, text=True)
print(result.stdout)
```

### 返回值处理

Skill 可以解析输出的 JSON 或直接使用标准输出内容进行后续处理。
