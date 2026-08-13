import json

from redis.asyncio import Redis

from app.models.device_channel import DeviceChannel

STREAM_COMMAND_CHANNEL = "stream.commands"


def build_stream_id(vehicle_id: int | str, channel_no: int) -> str:
    return f"{vehicle_id}-channel-{channel_no}"


async def publish_stream_command(
    redis: Redis,
    *,
    action: str,
    vehicle_id: int,
    channel_no: int,
    rtsp_url: str | None = None,
) -> None:
    payload: dict[str, object] = {
        "action": action,
        "vehicle_id": str(vehicle_id),
        "channel": channel_no,
        "stream_id": build_stream_id(vehicle_id, channel_no),
    }
    if rtsp_url:
        payload["rtsp_url"] = rtsp_url
    await redis.publish(STREAM_COMMAND_CHANNEL, json.dumps(payload))


async def publish_start(redis: Redis, vehicle_id: int, channel: DeviceChannel) -> None:
    if channel.rtsp_url:
        await publish_stream_command(
            redis,
            action="start",
            vehicle_id=vehicle_id,
            channel_no=channel.channel_no,
            rtsp_url=channel.rtsp_url,
        )


async def publish_restart(redis: Redis, vehicle_id: int, channel: DeviceChannel) -> None:
    if channel.rtsp_url:
        await publish_stream_command(
            redis,
            action="restart",
            vehicle_id=vehicle_id,
            channel_no=channel.channel_no,
            rtsp_url=channel.rtsp_url,
        )


async def publish_stop(redis: Redis, vehicle_id: int, channel_no: int) -> None:
    await publish_stream_command(
        redis,
        action="stop",
        vehicle_id=vehicle_id,
        channel_no=channel_no,
    )
