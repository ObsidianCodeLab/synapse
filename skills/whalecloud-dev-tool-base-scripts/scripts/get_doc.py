#!/usr/bin/env python3
"""
产品文档查询脚本

用于调用 SynapseService 的 get_doc 接口，获取指定产品的文档内容。

用法:
    python get_doc.py --doc_type=XXX --server_url=yyy --prod=zzz

参数:
    --doc_type: 文档类型，取值范围：产品架构、产品需求、产品方案、产品手册、交付材料
    --server_url: 服务地址，格式为 IP:PORT，例如 192.168.1.100:8080
    --prod: 产品名称
    --doc_name: 可选，指定要获取的文件名（支持逗号分隔多个文件名，会进行模糊匹配）

示例:
    python get_doc.py --doc_type=产品需求 --server_url=192.168.1.100:8080 --prod=分布式内存数据库
    python get_doc.py --doc_type=产品架构 --server_url=localhost:5000 --prod=XXX营销
    python get_doc.py --doc_type=产品需求 --server_url=192.168.1.100:8080 --prod=分布式内存数据库 --doc_name=需求文档
"""

import argparse
import json
import sys
import urllib.request
import urllib.error
import os


def call_get_doc_api(server_url: str, prod: str, doc_type: str) -> dict:
    """
    调用 get_doc 接口

    Args:
        server_url: 服务地址，格式为 IP:PORT
        prod: 产品名称
        doc_type: 文档类型

    Returns:
        接口响应结果
    """
    url = f"http://{server_url}/dev/iwhalecloud/synapse/get_doc"

    payload = {
        "prod": prod,
        "doc_type": doc_type
    }

    json_data = json.dumps(payload).encode('utf-8')

    req = urllib.request.Request(
        url,
        data=json_data,
        headers={'Content-Type': 'application/json'}
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result
    except urllib.error.HTTPError as e:
        return {
            "code": e.code,
            "message": f"HTTP 错误: {e.reason}",
            "data": None
        }
    except urllib.error.URLError as e:
        return {
            "code": -1,
            "message": f"连接失败: {e.reason}",
            "data": None
        }
    except Exception as e:
        return {
            "code": -1,
            "message": f"未知错误: {str(e)}",
            "data": None
        }


def main():
    parser = argparse.ArgumentParser(
        description="产品文档查询脚本 - 调用 SynapseService get_doc 接口",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    python get_doc.py --doc_type=产品需求 --server_url=192.168.1.100:8080 --prod=分布式内存数据库
    python get_doc.py --doc_type=产品架构 --server_url=localhost:5000 --prod=XXX营销
        """
    )

    parser.add_argument(
        "--doc_type",
        type=str,
        required=True,
        choices=["产品架构", "产品需求", "产品方案", "产品手册", "交付材料"],
        help="文档类型，取值范围：产品架构、产品需求、产品方案、产品手册、交付材料"
    )

    parser.add_argument(
        "--server_url",
        type=str,
        required=True,
        help="服务地址，格式为 IP:PORT，例如 192.168.1.100:8080"
    )

    parser.add_argument(
        "--prod",
        type=str,
        required=True,
        help="产品名称"
    )

    parser.add_argument(
        "--doc_name",
        type=str,
        default="",
        help="可选，指定要获取的文件名（支持逗号分隔多个文件名，会进行模糊匹配）"
    )

    parser.add_argument(
        "--output",
        type=str,
        default="",
        help="可选，指定输出目录，文档将保存到此目录"
    )

    args = parser.parse_args()

    doc_name_filter = args.doc_name.split(",") if args.doc_name else []
    output_dir = args.output

    print(f"[调用接口] server_url={args.server_url}, prod={args.prod}, doc_type={args.doc_type}")
    if doc_name_filter:
        print(f"[文件过滤] doc_name={doc_name_filter}")
    print("-" * 60)

    result = call_get_doc_api(args.server_url, args.prod, args.doc_type)

    code = result.get("code")
    message = result.get("message", "")
    data = result.get("data")

    if code == 0:
        print(f"[成功] {message}")
        if data:
            doc_content = data.get("doc_content", [])

            if doc_name_filter:
                filtered_content = []
                for doc in doc_content:
                    doc_name = doc.get("doc_name", "")
                    for filter_name in doc_name_filter:
                        if filter_name in doc_name:
                            filtered_content.append(doc)
                            break
                doc_content = filtered_content

            if doc_content:
                print(f"\n共返回 {len(doc_content)} 个文档文件:\n")
                for idx, doc in enumerate(doc_content, 1):
                    doc_name = doc.get("doc_name", "")
                    content = doc.get("content", "")
                    print(f"--- 文档 {idx}: {doc_name} ---")
                    print(f"内容长度: {len(content)} 字符")
                    print(f"内容预览:\n{content[:500]}...")
                    
                    if output_dir and content:
                        os.makedirs(output_dir, exist_ok=True)
                        safe_name = doc_name.replace("/", "_").replace("\\", "_")
                        file_path = os.path.join(output_dir, safe_name)
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(content)
                        print(f"已保存到: {file_path}")
                    print()
            else:
                print("未找到符合条件的文档内容")
        else:
            print("未找到文档内容")
    else:
        print(f"[失败] {message}")
        sys.exit(1)


if __name__ == "__main__":
    main()
