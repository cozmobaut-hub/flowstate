#!/usr/bin/env python3

import string
import json
import asyncio
import sys
from typing import Dict, Any, Iterable
import aiohttp
from tqdm.asyncio import tqdm as atqdm  # async-friendly tqdm

BASE_URL = "https://stoahub.org/ajax/searchcompetitorswithtrashed"

UNIQUE_KEY = "competitorID"
SORT_KEY = "name"

MAX_CONCURRENCY = 10  # bump up/down cautiously


def generate_queries_up_to_zzz(alphabet: str = string.ascii_lowercase) -> Iterable[str]:
    # 1-letter: a..z
    for ch in alphabet:
        yield ch
    # 2-letter: aa..zz
    for first in alphabet:
        for second in alphabet:
            yield first + second
    # 3-letter: aaa..zzz
    for first in alphabet:
        for second in alphabet:
            for third in alphabet:
                yield first + second + third


async def fetch_query(session: aiohttp.ClientSession, q: str, sem: asyncio.Semaphore) -> Any:
    url = BASE_URL
    params = {"q": q}
    async with sem:
        try:
            async with session.get(url, params=params, timeout=10) as resp:
                resp.raise_for_status()
                data = await resp.json()
                return data
        except aiohttp.ClientResponseError as e:
            # HTTP status errors (4xx/5xx)
            print(f"[HTTP {e.status}] q={q!r}: {e}", file=sys.stderr)
        except aiohttp.ClientError as e:
            # Network errors, connection resets, etc.
            print(f"[ClientError] q={q!r}: {e}", file=sys.stderr)
        except asyncio.TimeoutError:
            print(f"[Timeout] q={q!r}", file=sys.stderr)
        except Exception as e:
            print(f"[UnknownError] q={q!r}: {e}", file=sys.stderr)
        return None


def merge_results(items_by_key: Dict[str, Any], data: Any) -> None:
    if data is None:
        return

    if isinstance(data, list):
        objs = data
    elif isinstance(data, dict):
        if "results" in data and isinstance(data["results"], list):
            objs = data["results"]
        else:
            objs = [data]
    else:
        return

    for obj in objs:
        if not isinstance(obj, dict):
            continue
        key = obj.get(UNIQUE_KEY)
        if key is None:
            key = json.dumps(obj, sort_keys=True)
        items_by_key[key] = obj


async def main_async():
    items_by_key: Dict[str, Any] = {}
    sem = asyncio.Semaphore(MAX_CONCURRENCY)

    queries = list(generate_queries_up_to_zzz())
    total = len(queries)
    print(f"Total queries: {total}")

    async with aiohttp.ClientSession() as session:
        tasks = [fetch_query(session, q, sem) for q in queries]

        # Progress bar over completed tasks
        completed = 0
        async for coro in atqdm(asyncio.as_completed(tasks), total=total, desc="Scraping"):
            data = await coro
            completed += 1
            if completed % 500 == 0:
                print(f"\n[LOG] Completed {completed}/{total} requests", file=sys.stderr)
            merge_results(items_by_key, data)

    items = list(items_by_key.values())

    def sort_fn(obj: Dict[str, Any]) -> str:
        return str(
            obj.get(SORT_KEY)
            or obj.get(UNIQUE_KEY)
            or ""
        ).lower()

    items.sort(key=sort_fn)

    out_file = "stoahub_index.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    print(f"\nWrote {len(items)} unique items to {out_file}")


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()