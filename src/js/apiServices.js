import { getPage, getGenres, getMovieById } from './utils/apiReqst';
import vars from './utils/variables';
// Возвращает массив инфо фильмов по входному массиву ID
export const getMovieByIdArray = idArray => {
  const promiseRes = new Promise((resolve, reject) => {
    resolve(
      Promise.all(idArray.map(item => getMovieById(item))).then(data => {
        genreIdsConverting(data);
        releaseDataCut(data);

        return data;
      }),
    );
  });
  return promiseRes;
};


// ------ Функции для обработки массива жанров ------

// Получить массив жанров
function getGenresArray(ids) {
  return ids.map(item => getGenreById(item));
}

// Из массива жанров объекта возвращет строковое название жанра
function getGenreById(id) {
  const searchGenre = genresList.find(item => item.id === id);
  if (searchGenre) return searchGenre.name;
  else return '';
}

// Из массива жанров объекта возвращет строковое название жанра
function getGenreIdName(genre) {
  const searchGenreId = genresList.find(item => item.name === genre);
  if (searchGenreId) return searchGenreId.id;
  else return 0;
}

// ------ Функции для обработки объектов с инфо о фильмах от API ------
function genreIdsConverting(data) {
  try {
    data.forEach(
      item =>
        (item.genre_ids = Array.from(getGenresArray(item.genre_ids))),
    );
  } catch {
    return data.forEach(
      item =>
        (item.genres = Array.from(item.genres.map(item => item.name))),
    );
  }
}

function releaseDataCut(filteringArray) {
  filteringArray.forEach(item => {
    if (item.release_date) item.release_date = item.release_date.slice(0, 4);
  });
}

function changeMovieRating(filteringArray) {
  filteringArray.forEach(
    item => (item.vote_average = item.vote_average.toFixed(1)),
  );
}

// Для работы с API используем объект и его методы DataProccessing
// keywordSearch(keyword) - для поиска по сключевому слову
// getPopular() - получить список популярных фильмов
// getNextPage(page) - возвращает данные для страницы page

// Константа кол-во фильмов на каждой странице от API
const API_RESULTS_PER_PAGE = 20;

let genresList = [];

// Объект для формирования, отправки запроса и дальнейшей обработки данных
class ApiRequest {  
  constructor(keyword, genreId, apiPage, filmIndex, films) {
    this.keyword = keyword;
    this.apiPage = apiPage;
    this.filmIndex = filmIndex;
    this.films = films;
    this.genreId = genreId;
    this.promise = new Promise((resolve, reject) => {});
  }

  getData() {
    this.promise = getPage(this.keyword, this.apiPage, this.genreId);
    return this.promise;
  }
}

// Объект хранит в себе "служебные" результаты запроса (нужны для посчета кол-ва страниц)
class ApiData {
  constructor(keyword, genre, totalResults, totalPages) {
    this.keyword = keyword;
    this.totalResults = totalResults;
    this.totalPages = totalPages;
    this.genreId = getGenreIdName(genre);
  }

  updData(totalResults, totalPages) {
    this.totalResults = totalResults;
    this.totalPages = totalPages;
  }

  updKeyword(keyword) {
    this.keyword = keyword;
  }
  updGenreId(genre) {
    this.genreId = getGenreIdName(genre);
  }
}

// Объект хранит в себе данные о запросе в API (ключевое слово, общее кол-во результатов, кол-во страниц по запросу в API)
// Инфо о текущей странице для нашего приложения, и кол-во страниц для него
// массив жанров от API в представлении id : Name
// количество выводимых объектов на страницу для текущего расширения
export class DataProccessing {
  constructor(keyword = '', genre, totalResults, totalPages) {
    this.apiData = new ApiData(keyword, genre, totalResults, totalPages);
    this.apiRequests = [];
    this.appPages = 1;
    this.appCurrentPage = 1;
    this.promise = new Promise((resolve, reject) => {});
    this.resultsPerPage = 0;
    this.defineNewPageNumber();
  }

  get getAppPages() {
    return this.appPages;
  }

  get getAppCurrentPage() {
    return this.appCurrentPage;
  }

  // Поиск по ключевому слову
  keywordSearch(keyword) {
    // Обновить ключевое слово
    this.apiData.updKeyword(keyword);
    // Получить первую страницу по ключевому слову
    return this.getNextPage(1);
  }

  genreSearch(genre) {
    // Обновить ключевое слово
    this.apiData.updKeyword('');
    this.apiData.updGenreId(genre);
    return this.getNextPage(1);
  }

  async getNextPage(page) {
    // Если массив жанров пуст - запросить его у api
    if (genresList.length === 0) {
      await getGenres().then(data => (genresList = Array.from(data.genres)));
    }
    // создаю массив с объектами для запроса (это объект ApiRequest у которого есть метод getData() он возвращает промис запроса от axious)
    // Запрос мб один, если все объекты отображаемой страницы на одной странице api
    // запроса мб два, если часть объектов отображаемой страницы на одной странице api, а другие на следующей
    this.apiRequests.splice(0, this.apiRequests.length);
    // нужно для формирования данных запроса
    this.appCurrentPage = page;

    // Формируем объекты с данными запроса
    this.apiRequests = this.defineApiRequests();
    // массив объектов инфо о фильме

    const resultDataArr = [];
    // функция getNextPage должна вернуть промис, но только после того как оба запроса (если их 2) будут выполнены
    // Для этого использую Promise.all([массив промисов])
    this.promise = new Promise((resolve, reject) => {
      // говорим, что наш промис this.promise разрешится успешно, если оба запроса из api будут выполнены успешно
      resolve(
        Promise.all(this.apiRequests.map(item => item.getData())).then(data => {
          data.forEach(it =>
            this.updPageData(it.total_results, it.total_pages),
          );
          // здесь просто фильтрация массива - нужно жанры перобразоват в строку, обрезать дату
          data.map((it, index) => {
            const filtered = this.filterDataArray(it.results, index);
            resultDataArr.push(...filtered);
          });
          // возвращаем отфильтрованный массив
          return resultDataArr;
        }),
      );
    });

    return this.promise;
  }



  // Отслеживает изменилось ли разрешение экрана

  isResolutionChanged() {
    return this.resultsPerPage !== this.defineResultsPerPage();
  }

  // ------ PRIVATE ------

  // Новые данные от api - обновить кол-во результатов и страниц с результатами для нашего отображения
  updPageData(totalResults, totalPages) {
    this.apiData.updData(totalResults, totalPages);
    this.appPages = Math.ceil(totalResults / this.resultsPerPage);
  }

  // Обновить данные в соотвествии с новым расширением

  async updResolution() {
    // Определить новый номер показываемой страницы (опираюсь на первый элемент на странице до изменения расширения)

    const newPageNumber = this.defineNewPageNumber();
    if (newPageNumber) {
      return this.getNextPage(newPageNumber);
    }
  }

  // Фильтровать массив
  filterDataArray(item, ApiIndex) {
    const matchFilmIndex = this.apiRequests[ApiIndex].filmIndex;
    const matchFilms = this.apiRequests[ApiIndex].films;
    const filteredArray = item.filter(
      (it, index) =>
        index >= matchFilmIndex && index < matchFilmIndex + matchFilms,
    );
    // Названия жанров получить по ID и собрать в строку через запятую
    genreIdsConverting(filteredArray);

    // Дату обрезать (только год релиза, если он не underfined)
    releaseDataCut(filteredArray);

    // Рейтинг фильмов виводить с одним значением после точки(0.0)
    changeMovieRating(filteredArray);
    return filteredArray;
  }

  defineApiRequests() {
    // Создаем объект запроса
    const firstRequest = new ApiRequest(this.apiData.keyword, this.apiData.genreId);
    const resArray = [];
    // Рассчитываем какую страницу от API нужно запросить
    firstRequest.apiPage = Math.ceil(
      ((this.appCurrentPage - 1) * this.resultsPerPage + 1) /
        API_RESULTS_PER_PAGE,
    );
    // Рассчитываем начиная с какого объекста из ответа API будем забирать инфо
    firstRequest.filmIndex =
      ((this.appCurrentPage - 1) * this.resultsPerPage) % API_RESULTS_PER_PAGE;

    // Сколько фильмов из этой страницы API заберем (не больше this.resultsPerPage)
    firstRequest.films =
      firstRequest.filmIndex > API_RESULTS_PER_PAGE - this.resultsPerPage
        ? API_RESULTS_PER_PAGE - firstRequest.filmIndex
        : this.resultsPerPage;
    // Добавляем созданный объект в массив данных для запроса
    resArray.push(firstRequest);

    // Если количество фильмов на странице будет меньше this.resultsPerPage - нам нужен второй запрос
    if (firstRequest.films < this.resultsPerPage) {
      if ( firstRequest.apiPage + 1 <= this.apiData.totalPages){
      const secondRequest = new ApiRequest(this.apiData.keyword, this.apiData.genreId);
      secondRequest.apiPage = firstRequest.apiPage + 1;
      secondRequest.filmIndex = 0;
      secondRequest.films = this.resultsPerPage - firstRequest.films;
      // Добавляем созданный объект в массив данных для запроса
      resArray.push(secondRequest);
      }
    }
    return resArray;
  }

  // По расширению экрана определить количество выводимых элементов
  defineResultsPerPage() {
    if (window.innerWidth >= 1024) return vars.desktopPageSize;
    else if (window.innerWidth >= 768 && window.innerWidth < 1024) return vars.tabletPageSize;
    else if (window.innerWidth < 768) return vars.mobilePageSize;
  }

  // Определить страницу нового расширения учитывая текущие элементы на странице

  defineNewPageNumber() {
    const updResults = this.defineResultsPerPage();
    if (this.resultsPerPage === 0) this.resultsPerPage = updResults;
    if (this.resultsPerPage !== updResults) {
      // Индекс второго эл-та на текущей странице начиная с 1го (второго, потому что)
      const currentPageElemId =
        this.appCurrentPage * this.resultsPerPage - (this.resultsPerPage - 1);
      // Определяем на какой странице с новым расширением будет первый элемент текущей страницы
      const pageNumWithCurrElem = Math.ceil(currentPageElemId / updResults);
      // Обновить номер текущей страницы
      this.resultsPerPage = updResults;
      return pageNumWithCurrElem;
    }
  }
}
