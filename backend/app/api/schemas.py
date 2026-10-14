from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    preferredModel: str | None = None
    student: str | None = Field(default=None, max_length=256)
    subject: str | None = Field(default=None, max_length=256)


class SessionUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=512)
    preferredModel: str | None = None
    student: str | None = Field(default=None, max_length=256)
    subject: str | None = Field(default=None, max_length=256)


class SessionSourceAttach(BaseModel):
    sourceId: str


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=512)


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=512)


class ConversationSourcesUpdate(BaseModel):
    sourceIds: list[str]


class SessionMemoryUpdate(BaseModel):
    content: str = Field(max_length=8000)


class SessionMemoryAppend(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class SourcePaste(BaseModel):
    text: str = Field(min_length=1)
    title: str | None = Field(default=None, max_length=512)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    mode: str = "spar"
    model: str
    selection: str | None = None
    chunkId: str | None = None
