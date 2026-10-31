# 온도

온도는 학습 계획, 과목, 집중 시간과 학습 기록을 관리하는 macOS 앱입니다. 앱 화면은 HTML로 구성하고, Swift와 WebKit으로 macOS 창을 띄웁니다. 별도 패키지 설치 없이 Mac의 Xcode Command Line Tools로 빌드합니다.

## 실행

프로젝트 폴더에서 아래 명령을 실행하면 앱과 DMG를 빌드합니다.

```sh
./build-dmg.sh
```

앱은 `build/온도.app`, 설치 이미지는 `dist/온도.dmg`에 만들어집니다. DMG를 열어 온도를 Applications 폴더로 드래그하면 설치할 수 있습니다.

## iPad 웹에서 사용

맥이 없어도 접속하려면 `index.html`을 HTTPS 정적 호스팅에 배포하면 됩니다. GitHub Pages를 쓸 때는 새 저장소에 `index.html`을 올리고, 저장소의 **Settings → Pages**에서 `main` 브랜치의 `/ (root)`를 배포 소스로 선택합니다. 생성된 `https://<사용자명>.github.io/<저장소명>/` 주소를 iPad Safari에서 열면 됩니다.

저장소와 웹사이트 코드는 공개됩니다. 동기화를 설정하지 않은 동안 학습 기록은 각 브라우저에만 저장됩니다. 기기 간 동기화는 아래 Supabase 연결을 마친 뒤 같은 계정으로 로그인해야 작동합니다.

## 맥과 iPad 동기화 설정

Supabase 프로젝트 하나를 만들고 아래 과정을 한 번 진행합니다.

1. [Supabase](https://supabase.com/dashboard)에서 프로젝트를 만듭니다.
2. 프로젝트의 **SQL Editor**에서 이 저장소의 `supabase-setup.sql` 내용을 실행합니다. 개인 학습 데이터 테이블, 비공개 첨부파일 저장소와 사용자별 접근 정책이 만들어집니다.
3. Supabase **Authentication → URL Configuration**의 Site URL과 Redirect URLs에 `https://maratang1425-hue.github.io/ondo-study/`를 등록합니다.
4. 프로젝트의 **Connect** 화면에서 Project URL과 Publishable key를 복사합니다. **Secret key는 앱에 넣지 마세요.**
5. 맥과 iPad 각각에서 온도의 **동기화**를 열고 같은 Project URL과 Publishable key를 저장한 다음, 같은 이메일 계정으로 로그인합니다. 그러면 학습 계획, 과목·학습 시간, 수행 평가·첨부파일, 활동보고서, 동아리 기록이 공유됩니다.

새 계정의 이메일 인증을 켜두면 인증 메일의 링크를 눌러야 로그인할 수 있습니다. 첨부파일은 계정 전용 비공개 저장소에 복사되며, 파일 하나당 최대 20MB입니다. 앱은 다른 기기의 변경 사항을 약 20초마다 확인합니다. 동기화를 설정하기 전 입력한 데이터는 첫 로그인 때 클라우드 데이터에 합쳐집니다.

## 기능

- 오늘과 예정 학습 계획 추가 및 완료 표시
- 과목과 주간 목표 관리
- 1시간 10분 집중 타이머와 과목별 시간 기록
- 주간 학습 시간, 완료 계획, 연속 학습 표시
- 수행 평가 일정과 참고자료·첨부파일
- 학년별 활동보고서와 방송부 활동
- 로컬 저장 및 선택형 Supabase 기기 동기화
