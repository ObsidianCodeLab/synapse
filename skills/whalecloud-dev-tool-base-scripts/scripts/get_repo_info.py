#!/usr/bin/env python3
"""
产品仓库信息查询脚本

用于调用 SynapseService 的 get_repo_info 接口，获取指定产品的仓库信息，并提取仓库名称。

用法:
    python get_repo_info.py --server-url=xxx --prod=yyy

参数:
    --server-url: 服务地址，格式为 IP:PORT，例如 192.168.1.100:8080
    --prod: 产品名称

示例:
    python get_repo_info.py --server-url=192.168.1.100:8080 --prod=分布式内存数据库
    python get_repo_info.py --server-url=localhost:5000 --prod=XXX营销
"""

import argparse
import json
import re
import sys
import urllib.error
import urllib.request


def extract_repo_name(url: str) -> str:
    """
    从 Git URL 中提取仓库名称

    Args:
        url: Git 仓库 URL，例如 https://git.example.com/org/仓库A.git

    Returns:
        仓库名称，例如 仓库A
    """
    if not url:
        return ""

    match = re.search(r"/([^/]+?)(?:\.git)?$", url)
    if match:
        return match.group(1)
    return ""


def call_get_repo_info_api(server_url: str, prod: str) -> dict:
    """
    调用 get_repo_info 接口

    Args:
        server_url: 服务地址，格式为 IP:PORT
        prod: 产品名称

    Returns:
        接口响应结果
    """
    url = f"http://{server_url}/dev/iwhalecloud/synapse/get_repo_info"

    payload = {"prod": prod}

    json_data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=json_data, headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result
    except urllib.error.HTTPError as e:
        return {
            "code": e.code,
            "message": f"HTTP 错误: {e.reason}",
            "data": None,
        }
    except urllib.error.URLError as e:
        return {
            "code": -1,
            "message": f"连接失败: {e.reason}",
            "data": None,
        }
    except Exception as e:
        return {
            "code": -1,
            "message": f"未知错误: {str(e)}",
            "data": None,
        }


def main():
    parser = argparse.ArgumentParser(
        description="产品仓库信息查询脚本 - 调用 SynapseService get_repo_info 接口",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    python get_repo_info.py --server-url=192.168.1.100:8080 --prod=分布式内存数据库
    python get_repo_info.py --server-url=localhost:5000 --prod=XXX营销
        """,
    )

    parser.add_argument(
        "--server-url",
        type=str,
        required=True,
        help="服务地址，格式为 IP:PORT，例如 192.168.1.100:8080",
    )

    parser.add_argument(
        "--prod",
        type=str,
        required=True,
        help="产品名称",
    )

    args = parser.parse_args()

    result = call_get_repo_info_api(args.server_url, args.prod)

    code = result.get("code")
    message = result.get("message", "")
    data = result.get("data")

    if code == 0:
        if data and isinstance(data, list):
            repo_names = []
            for item in data:
                url = item.get("url", "")
                repo_name = extract_repo_name(url)
                if repo_name:
                    repo_names.append(repo_name)

            if repo_names:
                repo_list = ",".join(repo_names)
                print(f"产品：{args.prod} 一共有{len(repo_names)}个仓库：{repo_list}")
            else:
                print("未找到有效的仓库 URL")
        else:
            print("未找到仓库信息")
    else:
        print(f"[失败] {message}")
        sys.exit(1)


if __name__ == "__main__":
    main()
