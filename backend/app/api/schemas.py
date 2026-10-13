from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    preferredModel: str | None = None


class SessionSourceAttach(BaseModel):
    sourceId: str


class SourcePaste(BaseModel):
    text: str = Field(min_length=1)
    title: str | None = Field(default=None, max_length=512)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    mode: str = "spar"
    model: str
    selection: str | None = None
    chunkId: str | None = None
